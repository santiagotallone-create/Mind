import type { Pcm } from "./wav.js";

export interface SpeechRequest {
  text: string;
  voice: string;
  /** 1 es velocidad normal. */
  speed: number;
  instructions?: string;
}

/**
 * Contrato de los servicios de voz sintética. El resto del sistema solo conoce esta interfaz,
 * así que cambiar de servicio no toca la armada de la meditación ni los silencios.
 */
export interface SpeechProvider {
  /** Identifica al servicio y modelo; sirve para separar la caché de audios. */
  readonly id: string;
  /** Convierte un bloque de texto en audio PCM de 16 bits mono. */
  synthesize(request: SpeechRequest): Promise<Pcm>;
}
