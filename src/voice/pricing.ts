/** Precios en USD por millón de tokens. */
export interface RealtimePrices {
  textInput: number;
  audioInput: number;
  cachedText: number;
  cachedAudio: number;
  textOutput: number;
  audioOutput: number;
}

/**
 * Precios de OpenAI Realtime verificados el 2026-11-02 en developers.openai.com/api/docs/models.
 * Cambian con el tiempo: revísalos antes de confiar en el costo estimado.
 */
export const realtimePrices: Record<string, RealtimePrices> = {
  "gpt-realtime-2.1": {
    textInput: 4,
    audioInput: 32,
    cachedText: 0.4,
    cachedAudio: 0.4,
    textOutput: 24,
    audioOutput: 64,
  },
  "gpt-realtime-2.1-mini": {
    textInput: 0.6,
    audioInput: 10,
    cachedText: 0.06,
    cachedAudio: 0.3,
    textOutput: 2.4,
    audioOutput: 20,
  },
};
