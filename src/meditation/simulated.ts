import type { SpeechProvider, SpeechRequest } from "./speech.js";
import type { Pcm } from "./wav.js";

const SAMPLE_RATE = 24000;
/** Caracteres por segundo de un habla en español a velocidad 1 (aproximado). */
const CHARS_PER_SECOND = 14;

/**
 * Voz simulada para probar la estructura (duraciones y silencios) sin gastar ni usar clave.
 * Emite un tono suave durante el tiempo estimado de habla, para que se oiga dónde habla y dónde calla.
 */
export class SimulatedSpeechProvider implements SpeechProvider {
  readonly id = "simulado";

  async synthesize(request: SpeechRequest): Promise<Pcm> {
    const seconds = request.text.length / (CHARS_PER_SECOND * request.speed);
    const count = Math.round(seconds * SAMPLE_RATE);
    const fade = Math.round(0.05 * SAMPLE_RATE);
    const samples = Buffer.alloc(count * 2);
    for (let i = 0; i < count; i++) {
      const envelope = Math.min(1, i / fade, (count - i) / fade);
      const value = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 0.08 * envelope;
      samples.writeInt16LE(Math.round(value * 32767), i * 2);
    }
    return { samples, sampleRate: SAMPLE_RATE };
  }
}
