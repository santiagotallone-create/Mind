/** Audio PCM de 16 bits, mono, little-endian. */
export interface Pcm {
  samples: Buffer;
  sampleRate: number;
}

/** Lee un WAV y devuelve su audio como PCM de 16 bits mono. No asume la frecuencia: la toma de la cabecera. */
export function parseWav(buf: Buffer): Pcm {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("El audio recibido no es un WAV válido.");
  }
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    let size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (!sampleRate) throw new Error("WAV sin cabecera de formato.");
      // Algunos servicios dejan el tamaño en 0 o en 0xFFFFFFFF: se toma hasta el final del archivo.
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      const isPcm = format === 1 || format === 0xfffe;
      if (!isPcm || bits !== 16) {
        throw new Error(`Formato de WAV no soportado (formato ${format}, ${bits} bits). Se espera PCM de 16 bits.`);
      }
      if (channels < 1 || channels > 2) throw new Error(`WAV con ${channels} canales: no soportado.`);
      const frame = 2 * channels;
      const data = buf.subarray(body, body + size - (size % frame));
      return { samples: channels === 1 ? Buffer.from(data) : downmixToMono(data), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV sin datos de audio.");
}

function downmixToMono(stereo: Buffer): Buffer {
  const frames = stereo.length / 4;
  const mono = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const left = stereo.readInt16LE(i * 4);
    const right = stereo.readInt16LE(i * 4 + 2);
    mono.writeInt16LE(Math.round((left + right) / 2), i * 2);
  }
  return mono;
}

/** Escribe un WAV de 16 bits mono. */
export function writeWav(pcm: Pcm): Buffer {
  const dataSize = pcm.samples.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(pcm.sampleRate, 24);
  header.writeUInt32LE(pcm.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm.samples]);
}

/** Silencio exacto de la duración pedida. */
export function silence(seconds: number, sampleRate: number): Buffer {
  return Buffer.alloc(Math.round(seconds * sampleRate) * 2);
}

/** Duración en segundos de un audio PCM mono de 16 bits. */
export function durationSeconds(pcm: Pcm): number {
  return pcm.samples.length / 2 / pcm.sampleRate;
}
