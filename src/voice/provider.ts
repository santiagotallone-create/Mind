import type { Language } from "../config.js";

/** Configuración con la que se abre una sesión de voz. */
export interface VoiceSessionConfig {
  language: Language;
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
  /** Costo estimado en USD, si el motor lo informa. */
  estimatedCostUsd?: number;
}

/** Eventos que el motor entrega al resto del sistema. */
export interface VoiceProviderEvents {
  onAudio: (chunk: ArrayBuffer) => void;
  onTranscript: (role: "user" | "coach", text: string) => void;
  onError: (error: Error) => void;
}

/**
 * Contrato que deben cumplir todos los motores de voz.
 * El resto del sistema solo conoce esta interfaz, nunca al proveedor concreto.
 */
export interface VoiceProvider {
  start(config: VoiceSessionConfig, events: VoiceProviderEvents): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  /** Corta la respuesta del coach cuando el usuario lo interrumpe. */
  interrupt(): void;
  close(): Promise<SessionMetrics>;
}
