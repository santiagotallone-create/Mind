import { randomBytes } from "node:crypto";
import { createCoachTools } from "../coach/tools.js";
import { buildCoachInstructions } from "../coach/context.js";
import { CoachMemory } from "../coach/memory.js";
import type { Summarizer } from "../coach/summarizer.js";
import { languageSettings, turnDetectionFromEnv } from "../config.js";
import type { z } from "zod";
import type { VoiceTicketRequest, VoiceTicketResponseSchema } from "../contract/index.js";
import type { QuotaService } from "../quota/service.js";
import type { ServerEnv } from "../server/env.js";
import { ApiError } from "../server/errors.js";
import { RateLimiter } from "../server/rate-limit.js";
import type { DataStore } from "../store/types.js";
import type { VoiceProvider } from "./provider.js";
import { VoiceSession, type ClientSocket, type SessionLogger } from "./session.js";
import { stringsFor } from "./strings.js";

type VoiceTicketResponse = z.infer<typeof VoiceTicketResponseSchema>;

export interface VoiceServiceDeps {
  env: ServerEnv;
  store: DataStore;
  quota: QuotaService;
  clock: () => Date;
  providerFactory: () => VoiceProvider;
  summarizer: Summarizer;
  log: SessionLogger;
  /** Reloj monótono en ms para medir el tiempo activo. Por defecto, performance.now(). */
  now?: () => number;
}

interface TicketEntry {
  userId: string;
  talkId: string;
  resume: boolean;
  expiresAt: number;
}

/** Tickets de charlas nuevas: 10 por hora por usuario. Los de reconexión tienen un límite aparte para que una red inestable no agote el primero. */
const NEW_TALK_TICKETS_PER_HOUR = 10;
const RESUME_TICKETS_PER_HOUR = 30;

/**
 * Reparte los tickets de voz y mantiene las charlas abiertas (en memoria, con respaldo del consumo en la base).
 * Con --max-instances 1 todas las charlas viven en este proceso.
 */
export class VoiceService {
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly tickets = new Map<string, TicketEntry>();
  /** Charlas creadas al pedir el ticket y todavía sin conectar. */
  private readonly pending = new Map<string, { userId: string; expiresAt: number }>();
  private readonly newTalkLimiter: RateLimiter;
  private readonly resumeLimiter: RateLimiter;
  private readonly memory: CoachMemory;
  private readonly now: () => number;
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly deps: VoiceServiceDeps) {
    const clockMs = () => deps.clock().getTime();
    this.newTalkLimiter = new RateLimiter(NEW_TALK_TICKETS_PER_HOUR, 3_600_000, clockMs);
    this.resumeLimiter = new RateLimiter(RESUME_TICKETS_PER_HOUR, 3_600_000, clockMs);
    this.memory = new CoachMemory(deps.store, deps.summarizer, deps.log);
    this.now = deps.now ?? (() => performance.now());
  }

  /** Cierra lo que quedó abierto por un reinicio y empieza a medir el tiempo de las charlas. */
  async start(): Promise<void> {
    try {
      const closed = await this.deps.store.closeOpenTalks(this.deps.clock(), "error");
      if (closed > 0) this.deps.log.warn({ closed }, "Charlas que habían quedado abiertas se cerraron al arrancar");
    } catch (error) {
      this.deps.log.warn({ err: error instanceof Error ? error.message : String(error) }, "No se pudieron cerrar las charlas abiertas");
    }
    this.timer = setInterval(() => void this.tickAll(), 1000);
    this.timer.unref();
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    const closing = Promise.allSettled([...this.sessions.values()].map((session) => session.close("corte")));
    // Cloud Run da unos 10 segundos antes de apagar el proceso.
    await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, 8000).unref())]);
  }

  async createTicket(userId: string, request: VoiceTicketRequest, wsBase: string): Promise<VoiceTicketResponse> {
    const resuming = request.resumeTalkId !== undefined;
    const limit = (resuming ? this.resumeLimiter : this.newTalkLimiter).check(userId);
    if (!limit.allowed) {
      throw new ApiError("rate_limited", "Demasiados pedidos para hablar con el coach. Prueba más tarde.", { retryAfterSeconds: limit.retryAfterSeconds });
    }

    let talkId: string;
    if (request.resumeTalkId) {
      const session = this.sessions.get(request.resumeTalkId);
      if (!session || session.userId !== userId || !session.isLive) throw new ApiError("not_found", "Esa charla ya terminó.");
      talkId = session.talkId;
    } else {
      await this.assertOwnsReferences(userId, request);
      // El bloqueo con saldo en cero es del servidor: no depende de lo que haga la app.
      await this.deps.quota.assertCanStart(userId);
      const talk = await this.deps.store.createTalk({
        userId,
        type: request.talkType,
        planId: request.planId,
        sessionId: request.sessionId,
        startedAt: this.deps.clock(),
      });
      talkId = talk.id;
      this.pending.set(talkId, { userId, expiresAt: this.deps.clock().getTime() + (this.deps.env.voice.ticketTtlSeconds + 5) * 1000 });
    }

    const ticket = randomBytes(32).toString("base64url");
    const ttl = this.deps.env.voice.ticketTtlSeconds;
    this.tickets.set(ticket, { userId, talkId, resume: resuming, expiresAt: this.deps.clock().getTime() + ttl * 1000 });
    return { talkId, ticket, wsUrl: `${wsBase}/v1/voice?ticket=${ticket}`, expiresInSeconds: ttl };
  }

  /** Canjea un ticket. Es de un solo uso y vence a los 60 segundos. */
  consumeTicket(ticket: string): TicketEntry | null {
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    return entry.expiresAt > this.deps.clock().getTime() ? entry : null;
  }

  /** Abre la charla (o reconecta una existente) sobre el socket recién conectado. */
  async open(socket: ClientSocket, entry: TicketEntry): Promise<VoiceSession | null> {
    if (entry.resume) {
      const session = this.sessions.get(entry.talkId);
      if (!session || session.userId !== entry.userId || !session.attach(socket)) {
        socket.sendJson({ type: "error", code: "talk_not_found", retryable: false });
        socket.close();
        return null;
      }
      return session;
    }

    this.pending.delete(entry.talkId);
    try {
      const talk = await this.deps.store.getTalk(entry.userId, entry.talkId);
      if (!talk || talk.endedAt) throw new Error("La charla del ticket no existe o ya terminó");
      const session = await this.buildSession(entry.userId, talk);
      this.sessions.set(talk.id, session);
      await session.start(socket);
      return session;
    } catch (error) {
      this.deps.log.error({ err: error instanceof Error ? error.message : String(error), talkId: entry.talkId }, "No se pudo abrir la charla");
      socket.sendJson({ type: "error", code: "start_failed", retryable: true });
      socket.close();
      this.sessions.delete(entry.talkId);
      await this.deps.store.closeTalk(entry.talkId, { endedAt: this.deps.clock(), endReason: "error" }).catch(() => {});
      return null;
    }
  }

  /** Evalúa las reglas de tiempo de todas las charlas abiertas y limpia lo vencido. */
  async tickAll(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.sweep();
      await Promise.allSettled([...this.sessions.values()].map((session) => session.tick()));
    } finally {
      this.ticking = false;
    }
  }

  get openTalks(): number {
    return this.sessions.size;
  }

  private sweep(): void {
    const now = this.deps.clock().getTime();
    for (const [ticket, entry] of this.tickets) if (entry.expiresAt <= now) this.tickets.delete(ticket);
    for (const [talkId, info] of this.pending) {
      if (info.expiresAt > now) continue;
      this.pending.delete(talkId);
      // Pidió el ticket y nunca se conectó: la charla no empezó, no consumió nada.
      void this.deps.store.closeTalk(talkId, { endedAt: this.deps.clock(), endReason: "corte" }).catch(() => {});
    }
  }

  private async assertOwnsReferences(userId: string, request: VoiceTicketRequest): Promise<void> {
    const { store } = this.deps;
    if (request.planId && !(await store.getPlanContext(userId, request.planId))) throw new ApiError("not_found", "No se encontró ese plan.");
    if (request.sessionId && !(await store.getSessionContext(userId, request.sessionId))) throw new ApiError("not_found", "No se encontró esa sesión.");
  }

  private async buildSession(userId: string, talk: import("../store/types.js").TalkRecord): Promise<VoiceSession> {
    const { store, env, clock } = this.deps;
    // Si la charla anterior no llegó a resumirse (falló o se cortó), se completa ahora, con un tiempo máximo.
    await this.memory.summarizePending(userId, { timeoutMs: 5000 });

    const [profile, progress, summaries, settings, session, plan] = await Promise.all([
      store.getProfile(userId),
      store.getProgress(userId),
      this.memory.recent(userId),
      store.getSettings(userId),
      talk.sessionId ? store.getSessionContext(userId, talk.sessionId) : null,
      talk.planId ? store.getPlanContext(userId, talk.planId) : null,
    ]);

    const provider = this.deps.providerFactory();
    const tools = createCoachTools({
      ajustar_velocidad: async ({ velocidad }) => {
        provider.setSpeed(velocidad);
        store.updateVoiceSpeed(userId, velocidad).catch((error) => this.deps.log.warn({ err: String(error) }, "No se pudo guardar la velocidad"));
        return { ok: true, velocidad_actual: velocidad };
      },
      guardar_perfil: async (args) => {
        await store.updateProfile(userId, { goals: args.objetivos, experience: args.experiencia, currentState: args.estado_actual });
        return { ok: true };
      },
      marcar_entrevista_completa: async () => {
        await store.markInterviewComplete(userId, clock());
        return { ok: true };
      },
    });

    const language = settings.locale;
    const instructions = await buildCoachInstructions({
      language,
      talkType: talk.type,
      now: clock(),
      timeZone: settings.timezone,
      profile,
      progress,
      summaries,
      session,
      plan,
      tools: tools.enabled,
    });

    return new VoiceSession({
      userId,
      talk,
      provider,
      providerConfig: {
        language,
        speed: settings.voiceSpeed,
        turnDetection: turnDetectionFromEnv(),
        instructions,
        voice: languageSettings[language].voice,
      },
      tools,
      store,
      quota: this.deps.quota,
      memory: this.memory,
      limits: env.voice,
      strings: stringsFor(language),
      now: this.now,
      clock,
      log: this.deps.log,
      onClosed: (talkId) => this.sessions.delete(talkId),
    });
  }
}
