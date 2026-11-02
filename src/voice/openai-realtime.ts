import WebSocket from "ws";
import { clampSpeed, MAX_SPEED, MIN_SPEED } from "../config.js";
import { realtimePrices } from "./pricing.js";
import type {
  SessionMetrics,
  TokenBreakdown,
  VoiceProvider,
  VoiceProviderEvents,
  VoiceSessionConfig,
} from "./provider.js";

const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/** Herramienta que permite al coach cambiar la velocidad de su voz cuando la persona lo pide. */
const SPEED_TOOL = {
  type: "function",
  name: "ajustar_velocidad",
  description:
    "Cambia la velocidad de tu propia voz cuando la persona pide que hables más lento o más rápido. " +
    "1 es la velocidad normal; un valor menor es más lento. Cambia de a 0.1 o 0.15 respecto de la velocidad actual.",
  parameters: {
    type: "object",
    properties: {
      velocidad: {
        type: "number",
        description: `Nueva velocidad, entre ${MIN_SPEED} y ${MAX_SPEED}. Por ejemplo 0.85 para hablar más lento.`,
      },
    },
    required: ["velocidad"],
  },
} as const;

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
  private model = DEFAULT_MODEL;
  private speed = 1;
  private silenceMs = 0;
  private tokens: TokenBreakdown = {
    textInput: 0,
    audioInput: 0,
    cachedTextInput: 0,
    cachedAudioInput: 0,
    textOutput: 0,
    audioOutput: 0,
  };
  /** Pasa a false si alguna respuesta llega sin el detalle de tokens. */
  private detailedUsage = true;
  private loggedUsage = false;

  async start(config: VoiceSessionConfig, events: VoiceProviderEvents): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Falta OPENAI_API_KEY. Completa el archivo .env y reinicia el servidor.");
    }
    const model = process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL;
    this.model = model;
    this.speed = clampSpeed(config.speed ?? 1);
    const td = config.turnDetection;
    this.silenceMs = td && td.mode === "server" ? td.silenceMs : 0;
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
        instructions: `${config.instructions}\n\nVelocidad actual de tu voz: ${this.speed}.`,
        tools: [SPEED_TOOL],
        tool_choice: "auto",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            turn_detection: this.turnDetectionPayload(config),
            transcription: { model: TRANSCRIPTION_MODEL, language: config.language },
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
            speed: this.speed,
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
      perceivedLatenciesMs: this.latenciesMs.map((ms) => ms + this.silenceMs),
      model: this.model,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
    };
    if (this.detailedUsage) metrics.tokens = this.tokens;

    // El costo solo se calcula si conocemos los precios del modelo, para no inventar cifras.
    const p = realtimePrices[this.model];
    if (p) {
      const t = this.tokens;
      metrics.costIsUpperBound = !this.detailedUsage;
      metrics.estimatedCostUsd = this.detailedUsage
        ? (t.textInput * p.textInput +
            t.audioInput * p.audioInput +
            t.cachedTextInput * p.cachedText +
            t.cachedAudioInput * p.cachedAudio +
            t.textOutput * p.textOutput +
            t.audioOutput * p.audioOutput) /
          1_000_000
        : (this.inputTokens * p.audioInput + this.outputTokens * p.audioOutput) / 1_000_000;
    }
    return metrics;
  }

  /** Ejecuta una herramienta pedida por el coach y le devuelve el resultado. */
  private handleToolCall(item: { name?: string; arguments?: string; call_id?: string }): void {
    if (item.name !== SPEED_TOOL.name || !item.call_id) return;
    let requested = NaN;
    try {
      requested = Number(JSON.parse(item.arguments ?? "{}").velocidad);
    } catch {
      // Argumentos inválidos: se informa abajo.
    }
    let output: Record<string, unknown>;
    if (Number.isFinite(requested)) {
      this.speed = clampSpeed(requested);
      // La velocidad solo cambia entre turnos; la siguiente respuesta ya sale con el nuevo valor.
      this.send({ type: "session.update", session: { type: "realtime", audio: { output: { speed: this.speed } } } });
      output = { ok: true, velocidad_actual: this.speed };
    } else {
      output = { ok: false, error: "velocidad inválida", velocidad_actual: this.speed };
    }
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(output) },
    });
    this.send({ type: "response.create" });
  }

  /** Suma el uso de una respuesta. Si falta el detalle, el costo pasa a ser una cota superior. */
  private addUsage(usage: any): void {
    if (!this.loggedUsage) {
      // Se muestra una vez para poder validar la forma real de los datos del servicio.
      console.log("Ejemplo de usage del servicio:", JSON.stringify(usage));
      this.loggedUsage = true;
    }
    this.inputTokens += usage.input_tokens ?? 0;
    this.outputTokens += usage.output_tokens ?? 0;

    const inDetails = usage.input_token_details;
    const outDetails = usage.output_token_details;
    if (!inDetails || !outDetails) {
      this.detailedUsage = false;
      return;
    }
    const cachedDetails = inDetails.cached_tokens_details;
    const cachedAudio = cachedDetails ? (cachedDetails.audio_tokens ?? 0) : (inDetails.cached_tokens ?? 0);
    const cachedText = cachedDetails ? (cachedDetails.text_tokens ?? 0) : 0;
    this.tokens.cachedAudioInput += cachedAudio;
    this.tokens.cachedTextInput += cachedText;
    this.tokens.audioInput += Math.max(0, (inDetails.audio_tokens ?? 0) - cachedAudio);
    this.tokens.textInput += Math.max(0, (inDetails.text_tokens ?? 0) - cachedText);
    this.tokens.textOutput += outDetails.text_tokens ?? 0;
    this.tokens.audioOutput += outDetails.audio_tokens ?? 0;
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
        if (msg.response?.usage) this.addUsage(msg.response.usage);
        // Las herramientas se ejecutan cuando la respuesta terminó, para no interferir con el audio en curso.
        for (const item of msg.response?.output ?? []) {
          if (item.type === "function_call") this.handleToolCall(item);
        }
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
