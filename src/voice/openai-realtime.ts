import WebSocket from "ws";
import type {
  SessionMetrics,
  VoiceProvider,
  VoiceProviderEvents,
  VoiceSessionConfig,
} from "./provider.js";

const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/**
 * Motor 1: servicio de voz de extremo a extremo (OpenAI Realtime), por WebSocket desde el servidor.
 * La clave de API vive solo en el servidor (OPENAI_API_KEY) y nunca llega al navegador.
 */
export class OpenAIRealtimeProvider implements VoiceProvider {
  private ws?: WebSocket;
  private events?: VoiceProviderEvents;
  private startedAt = 0;
  private latenciesMs: number[] = [];
  private speechStoppedAt?: number;
  private inputTokens = 0;
  private outputTokens = 0;

  async start(config: VoiceSessionConfig, events: VoiceProviderEvents): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Falta OPENAI_API_KEY. Completa el archivo .env y reinicia el servidor.");
    }
    const model = process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL;
    this.events = events;
    this.startedAt = Date.now();

    const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
      ws.once("unexpected-response", (_req, res) =>
        reject(new Error(`OpenAI rechazó la conexión (HTTP ${res.statusCode}). Revisa la clave y el saldo.`)),
      );
    });

    ws.on("message", (data) => this.handleMessage(data.toString()));
    ws.on("error", (err) => events.onError(err));

    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        model,
        output_modalities: ["audio"],
        instructions: config.instructions,
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            turn_detection: this.turnDetectionPayload(config),
            transcription: { model: TRANSCRIPTION_MODEL, language: config.language },
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            voice: config.voice && config.voice !== "por-definir" ? config.voice : DEFAULT_VOICE,
          },
        },
      },
    });
  }

  private turnDetectionPayload(config: VoiceSessionConfig): Record<string, unknown> {
    const td = config.turnDetection;
    if (!td || td.mode === "semantic") {
      return { type: "semantic_vad", eagerness: td?.eagerness ?? "auto" };
    }
    return {
      type: "server_vad",
      threshold: td.threshold,
      silence_duration_ms: td.silenceMs,
      prefix_padding_ms: 300,
    };
  }

  sendAudio(chunk: ArrayBuffer): void {
    this.send({ type: "input_audio_buffer.append", audio: Buffer.from(chunk).toString("base64") });
  }

  interrupt(): void {
    this.send({ type: "response.cancel" });
  }

  async close(): Promise<SessionMetrics> {
    this.ws?.close();
    const metrics: SessionMetrics = {
      durationSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      responseLatenciesMs: this.latenciesMs,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
    };
    // El costo solo se estima si configuras los precios (USD por millón de tokens), para no inventar cifras.
    const priceIn = Number(process.env.OPENAI_PRICE_IN_PER_M);
    const priceOut = Number(process.env.OPENAI_PRICE_OUT_PER_M);
    if (priceIn > 0 && priceOut > 0) {
      metrics.estimatedCostUsd = (this.inputTokens * priceIn + this.outputTokens * priceOut) / 1_000_000;
    }
    return metrics;
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: string): void {
    const events = this.events;
    if (!events) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "response.output_audio.delta": {
        if (this.speechStoppedAt !== undefined) {
          this.latenciesMs.push(Date.now() - this.speechStoppedAt);
          this.speechStoppedAt = undefined;
        }
        const bytes = Buffer.from(msg.delta, "base64");
        events.onAudio(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        break;
      }
      case "response.output_audio_transcript.done":
        events.onTranscript("coach", msg.transcript);
        break;
      case "conversation.item.input_audio_transcription.completed":
        events.onTranscript("user", msg.transcript);
        break;
      case "input_audio_buffer.speech_started":
        events.onInterrupted?.();
        break;
      case "input_audio_buffer.speech_stopped":
        this.speechStoppedAt = Date.now();
        break;
      case "response.done":
        this.inputTokens += msg.response?.usage?.input_tokens ?? 0;
        this.outputTokens += msg.response?.usage?.output_tokens ?? 0;
        break;
      case "error": {
        const text: string = msg.error?.message ?? "Error desconocido del servicio de voz";
        // Cancelar cuando no hay respuesta en curso no es un problema real.
        if (!/no active response/i.test(text)) events.onError(new Error(text));
        break;
      }
    }
  }
}
