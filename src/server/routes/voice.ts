import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { VoiceTicketRequestSchema, VoiceTicketResponseSchema, type ServerEvent } from "../../contract/index.js";
import type { ClientSocket } from "../../voice/session.js";
import type { RouteRegistrar } from "../context.js";
import { parseOrThrow } from "../errors.js";
import { RateLimiter } from "../rate-limit.js";

/** Un WebSocket de `ws` visto como la conexión con la app. */
export class WsClientSocket implements ClientSocket {
  constructor(private readonly ws: WebSocket) {}

  get isOpen(): boolean {
    return this.ws.readyState === this.ws.OPEN;
  }

  sendJson(event: ServerEvent): void {
    if (this.isOpen) this.ws.send(JSON.stringify(event));
  }

  sendAudio(chunk: Buffer): void {
    // Si la app no lee, no se acumula audio sin límite.
    if (this.isOpen && this.ws.bufferedAmount < 1_000_000) this.ws.send(chunk, { binary: true });
  }

  close(): void {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) this.ws.close(1000);
  }
}

const PING_EVERY_MS = 15_000;
/** Conexiones al WebSocket por minuto y dirección IP. */
const CONNECTIONS_PER_MINUTE = 30;
/** Los mensajes de la app son audio de a pocos KB o JSON pequeño. */
const MAX_MESSAGE_BYTES = 256 * 1024;

export const registerVoiceRoutes: RouteRegistrar = (app, ctx) => {
  const connectionLimiter = new RateLimiter(CONNECTIONS_PER_MINUTE, 60_000, () => ctx.clock().getTime());

  app.post("/v1/voice/tickets", async (request) => {
    const body = parseOrThrow(VoiceTicketRequestSchema, request.body);
    const wsBase = ctx.env.publicUrl
      ? ctx.env.publicUrl.replace(/^http/, "ws").replace(/\/$/, "")
      : `${request.protocol === "https" ? "wss" : "ws"}://${request.hostname}`;
    return VoiceTicketResponseSchema.parse(await ctx.voice.createTicket(request.auth!.userId, body, wsBase));
  });

  // El plugin de WebSocket tiene que estar cargado antes de definir la ruta, por eso va en su propio contexto.
  app.register(async (instance) => {
    await instance.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

    // La ruta no usa token de acceso: se entra con el ticket de un solo uso (la URL no contiene el token).
    instance.get("/v1/voice", { websocket: true, config: { public: true } }, (socket, request) => {
      const client = new WsClientSocket(socket);
      const reject = (code: string) => {
        client.sendJson({ type: "error", code, retryable: false });
        socket.close(1008, code);
      };

      const origin = request.headers.origin;
      if (ctx.env.allowedOrigins.length > 0 && origin && !ctx.env.allowedOrigins.includes(origin)) return reject("origin_not_allowed");
      if (!connectionLimiter.check(request.ip).allowed) return reject("rate_limited");
      const ticket = (request.query as { ticket?: unknown }).ticket;
      const entry = typeof ticket === "string" ? ctx.voice.consumeTicket(ticket) : null;
      if (!entry) return reject("invalid_ticket");

      let session: Awaited<ReturnType<typeof ctx.voice.open>> = null;
      let closed = false;

      // Sin respuesta al ping, la conexión está muerta (túnel, apagado del celular): se corta para que el servidor lo note.
      let alive = true;
      socket.on("pong", () => {
        alive = true;
      });
      const keepAlive = setInterval(() => {
        if (!alive) return socket.terminate();
        alive = false;
        socket.ping();
      }, PING_EVERY_MS);

      socket.on("message", (data, isBinary) => {
        const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        session?.handleClientMessage(buffer, isBinary);
      });
      socket.on("close", () => {
        closed = true;
        clearInterval(keepAlive);
        session?.handleSocketClosed(client);
      });
      socket.on("error", (error) => request.log.warn({ err: error.message }, "Error en el WebSocket de voz"));

      void ctx.voice.open(client, entry).then((opened) => {
        session = opened;
        if (closed) opened?.handleSocketClosed(client);
      });
    });
  });
};
