import type { SpeechProvider, SpeechRequest } from "./speech.js";
import { parseWav, type Pcm } from "./wav.js";

export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";

/**
 * Voz sintética de OpenAI (POST /v1/audio/speech).
 * Aviso: según la documentación consultada el 2026-11-03, estos modelos de voz dejan de funcionar el
 * 2027-01-06 y OpenAI recomienda migrar a la API Realtime. Por eso el servicio vive detrás de `SpeechProvider`.
 */
export class OpenAITtsProvider implements SpeechProvider {
  readonly id: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_TTS_MODEL,
  ) {
    this.id = `openai-tts:${model}`;
  }

  async synthesize(request: SpeechRequest): Promise<Pcm> {
    const body = JSON.stringify({
      model: this.model,
      input: request.text,
      voice: request.voice,
      speed: request.speed,
      // Se pide WAV y se lee su cabecera, en vez de suponer la frecuencia de un PCM sin cabecera.
      response_format: "wav",
      ...(request.instructions ? { instructions: request.instructions } : {}),
    });

    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body,
      });
      if (res.ok) return parseWav(Buffer.from(await res.arrayBuffer()));

      lastError = `OpenAI respondió ${res.status}: ${(await res.text()).slice(0, 300)}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
    throw new Error(lastError);
  }
}
