import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clampSpeed } from "../config.js";
import type { MeditationScript } from "./script.js";
import type { SpeechProvider } from "./speech.js";
import { durationSeconds, parseWav, silence, writeWav, type Pcm } from "./wav.js";

export interface BuildOptions {
  voice: string;
  speed: number;
  instructions?: string;
  /** Carpeta donde se guardan los audios ya generados. Evita volver a pagar al cambiar solo las pausas. */
  cacheDir?: string;
  /** Silencio antes de la primera frase y después de la última, en segundos. */
  leadSeconds?: number;
  tailSeconds?: number;
  onProgress?: (message: string) => void;
}

export interface SegmentInfo {
  text: string;
  seconds: number;
  fromCache: boolean;
}

export interface BuildResult {
  wav: Buffer;
  sampleRate: number;
  totalSeconds: number;
  speechSeconds: number;
  silenceSeconds: number;
  segments: SegmentInfo[];
  /** Solo lo que se generó en esta ejecución (lo que viene de la caché no se cobra de nuevo). */
  generatedChars: number;
  generatedSeconds: number;
}

type Part = { audio: Pcm } | { silence: number };

/** Convierte el guion en un único audio, con los silencios exactos que marca el guion. */
export async function buildMeditation(
  script: MeditationScript,
  provider: SpeechProvider,
  options: BuildOptions,
): Promise<BuildResult> {
  const voice = script.voice ?? options.voice;
  const speed = clampSpeed(script.speed ?? options.speed);
  const instructions = script.instructions ?? options.instructions;
  const lead = options.leadSeconds ?? 1.5;
  const tail = options.tailSeconds ?? 3;
  const total = script.steps.filter((s) => s.kind === "speech").length;

  if (options.cacheDir) await mkdir(options.cacheDir, { recursive: true });

  const parts: Part[] = [{ silence: lead }];
  const segments: SegmentInfo[] = [];
  let sampleRate = 0;
  let generatedChars = 0;
  let generatedSeconds = 0;
  let done = 0;

  for (const step of script.steps) {
    if (step.kind === "pause") {
      parts.push({ silence: step.seconds });
      continue;
    }

    done++;
    const request = { text: step.text, voice, speed, instructions };
    const key = createHash("sha256")
      .update(JSON.stringify([provider.id, request.text, request.voice, request.speed, request.instructions ?? ""]))
      .digest("hex")
      .slice(0, 32);
    const cacheFile = options.cacheDir ? join(options.cacheDir, `${key}.wav`) : undefined;

    let audio: Pcm | undefined;
    let fromCache = false;
    if (cacheFile) {
      try {
        audio = parseWav(await readFile(cacheFile));
        fromCache = true;
      } catch {
        audio = undefined;
      }
    }
    if (!audio) {
      options.onProgress?.(`Generando voz ${done}/${total}...`);
      audio = await provider.synthesize(request);
      generatedChars += step.text.length;
      generatedSeconds += durationSeconds(audio);
      if (cacheFile) await writeFile(cacheFile, writeWav(audio));
    } else {
      options.onProgress?.(`Voz ${done}/${total} reutilizada de la caché.`);
    }

    if (sampleRate && audio.sampleRate !== sampleRate) {
      throw new Error(`El servicio devolvió frecuencias distintas (${sampleRate} y ${audio.sampleRate} Hz).`);
    }
    sampleRate = audio.sampleRate;
    segments.push({ text: step.text, seconds: durationSeconds(audio), fromCache });
    parts.push({ audio });
  }
  parts.push({ silence: tail });

  const buffers = parts.map((p) => ("audio" in p ? p.audio.samples : silence(p.silence, sampleRate)));
  const pcm: Pcm = { samples: Buffer.concat(buffers), sampleRate };
  const speechSeconds = segments.reduce((sum, s) => sum + s.seconds, 0);
  const totalSeconds = durationSeconds(pcm);

  return {
    wav: writeWav(pcm),
    sampleRate,
    totalSeconds,
    speechSeconds,
    silenceSeconds: totalSeconds - speechSeconds,
    segments,
    generatedChars,
    generatedSeconds,
  };
}
