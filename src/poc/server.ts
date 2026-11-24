import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { loadCoachPrompt } from "../coach/prompt.js";
import { createCoachTools } from "../coach/tools.js";
import { defaultConfig, languageSettings, speedFromEnv, turnDetectionFromEnv } from "../config.js";
import { createVoiceProvider } from "../voice/index.js";
import type { VoiceProvider } from "../voice/provider.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "127.0.0.1"; // Solo accesible desde tu computadora.

const server = createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const html = await readFile(new URL("./public/index.html", import.meta.url));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

function sendJson(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

wss.on("connection", (ws) => {
  let provider: VoiceProvider | undefined;

  const stop = async () => {
    if (!provider) return;
    const current = provider;
    provider = undefined;
    const metrics = await current.close();
    console.log("Sesión terminada:", metrics);
    sendJson(ws, { type: "metrics", metrics });
  };

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      // Audio del micrófono: PCM 16 bits, mono, 24 kHz.
      const buf = data as Buffer;
      provider?.sendAudio(new Uint8Array(buf).buffer);
      return;
    }
    const msg = JSON.parse(data.toString());

    if (msg.type === "start" && !provider) {
      const { language, provider: providerName } = defaultConfig;
      const current = createVoiceProvider(providerName);
      provider = current;
      // La prueba de concepto solo ofrece al coach la herramienta de velocidad.
      const tools = createCoachTools({
        ajustar_velocidad: async ({ velocidad }) => {
          current.setSpeed(velocidad);
          return { ok: true, velocidad_actual: velocidad };
        },
      });
      try {
        await current.start(
          {
            language,
            turnDetection: turnDetectionFromEnv(),
            speed: speedFromEnv(),
            instructions: await loadCoachPrompt(language),
            voice: languageSettings[language].voice,
            tools: tools.definitions,
          },
          {
            onToolCall: (call) => tools.handle(call),
            onAudio: (chunk) => ws.send(chunk),
            onTranscript: (role, text) => sendJson(ws, { type: "transcript", role, text }),
            onInterrupted: () => sendJson(ws, { type: "interrupted" }),
            onError: (error) => sendJson(ws, { type: "error", message: error.message }),
          },
        );
        sendJson(ws, { type: "ready" });
      } catch (error) {
        provider = undefined;
        sendJson(ws, { type: "error", message: (error as Error).message });
      }
    } else if (msg.type === "stop") {
      await stop();
    }
  });

  ws.on("close", () => void stop());
});

server.listen(PORT, HOST, () => {
  console.log(`Prueba de concepto lista: abre http://localhost:${PORT} en Chrome`);
});
