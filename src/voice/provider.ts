import type { Language, TurnDetectionConfig } from "../config.js";

/** Configuración con la que se abre una sesión de voz. */
export interface VoiceSessionConfig {
  language: Language;
  /** Velocidad inicial de la voz del coach: 1 es normal, menos de 1 es más lento. */
  speed?: number;
  /** Sensibilidad de la detección de turnos. Si falta, el motor usa sus valores por defecto. */
  turnDetection?: TurnDetectionConfig;
  /** Prompt y personalidad del coach (viene de src/coach/prompts). */
  instructions: string;
  /** Nombre de la voz del motor elegido. */
  voice?: string;
}

/** Métricas de una sesión, para comparar motores. */
export interface SessionMetrics {
  durationSeconds: number;
  /** Latencia desde que el motor detecta el fin de mi frase hasta el inicio de la respuesta, en ms. */
  responseLatenciesMs: number[];
  /**
   * Latencia aproximada que siente el usuario: la anterior más el silencio que el sistema espera
   * antes de dar por terminada la frase.
   */
  perceivedLatenciesMs?: number[];
  model?: string;
  /** Tokens consumidos, si el motor los informa. */
  inputTokens?: number;
  outputTokens?: number;
  /** Desglose de tokens. Solo existe si el servicio entregó el detalle en todas las respuestas. */
  tokens?: TokenBreakdown;
  /** Costo estimado en USD, si se conocen los precios del modelo. */
  estimatedCostUsd?: number;
  /**
   * true si el costo es una cota superior (sin desglose, todo se cobra como audio sin caché);
   * false si se calculó con el desglose real.
   */
  costIsUpperBound?: boolean;
}

export interface TokenBreakdown {
  textInput: number;
  audioInput: number;
  cachedTextInput: number;
  cachedAudioInput: number;
  textOutput: number;
  audioOutput: number;
}

/** Eventos que el motor entrega al resto del sistema. */
export interface VoiceProviderEvents {
  /** Audio del coach: PCM 16 bits, mono, 24 kHz. */
  onAudio: (chunk: ArrayBuffer) => void;
  onTranscript: (role: "user" | "coach", text: string) => void;
  /** El usuario empezó a hablar: hay que cortar el audio del coach que se esté reproduciendo. */
  onInterrupted?: () => void;
  onError: (error: Error) => void;
}

/**
 * Contrato que deben cumplir todos los motores de voz.
 * El resto del sistema solo conoce esta interfaz, nunca al proveedor concreto.
 * Formato de audio en ambos sentidos: PCM 16 bits, mono, 24 kHz.
 */
export interface VoiceProvider {
  start(config: VoiceSessionConfig, events: VoiceProviderEvents): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  /** Corta la respuesta del coach cuando el usuario lo interrumpe. */
  interrupt(): void;
  close(): Promise<SessionMetrics>;
}
