import type { Language, TurnDetectionConfig } from "../config.js";

/** Configuración con la que se abre una sesión de voz. */
export interface VoiceSessionConfig {
  language: Language;
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
  /** Latencia entre el fin de mi frase y el inicio de la respuesta, en ms. */
  responseLatenciesMs: number[];
  /** Tokens de audio consumidos, si el motor los informa. */
  inputTokens?: number;
  outputTokens?: number;
  /** Costo estimado en USD. Solo se calcula si hay precios configurados. */
  estimatedCostUsd?: number;
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
