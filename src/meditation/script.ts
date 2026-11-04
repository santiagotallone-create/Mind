export type Step = { kind: "speech"; text: string } | { kind: "pause"; seconds: number };

export interface MeditationScript {
  title: string;
  targetMinutes?: number;
  voice?: string;
  speed?: number;
  /** Indicaciones de estilo para la voz (tono, ritmo, calidez). */
  instructions?: string;
  steps: Step[];
}

const MAX_TEXT_CHARS = 1500; // Cada bloque va en una sola llamada de voz; el límite del servicio es 4096.
const MAX_PAUSE_SECONDS = 180;
const PAUSE_LINE = /^\[pausa\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos)?\s*\]$/i;

/**
 * Lee un guion de meditación.
 *
 * Formato:
 *  - Cabecera opcional entre líneas `---` con `clave: valor` (titulo, duracion_objetivo_min, voz, velocidad,
 *    instrucciones, pausa_por_defecto).
 *  - Cada línea de texto es un bloque que se pronuncia de una vez.
 *  - `[pausa N]` inserta N segundos de silencio exacto.
 *  - Las líneas que empiezan con `#` son comentarios y no se pronuncian.
 *  - Entre dos bloques de texto seguidos se inserta `pausa_por_defecto` segundos (1,5 si no se indica).
 */
export function parseScript(source: string): MeditationScript {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const meta: Record<string, string> = {};
  let i = 0;

  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i]?.trim() === "---") {
    i++;
    while (i < lines.length && lines[i].trim() !== "---") {
      const match = lines[i].match(/^\s*([\wáéíóúñ]+)\s*:\s*(.*?)\s*$/i);
      if (match) meta[match[1].toLowerCase()] = match[2];
      i++;
    }
    if (i >= lines.length) throw new Error("La cabecera del guion no se cierra con '---'.");
    i++;
  }

  const defaultPause = numberFrom(meta["pausa_por_defecto"], 1.5, "pausa_por_defecto");
  const steps: Step[] = [];

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    const pause = line.match(PAUSE_LINE);
    if (pause) {
      const seconds = Number(pause[1].replace(",", "."));
      if (!(seconds > 0) || seconds > MAX_PAUSE_SECONDS) {
        throw new Error(`Línea ${i + 1}: la pausa debe estar entre 0 y ${MAX_PAUSE_SECONDS} segundos.`);
      }
      steps.push({ kind: "pause", seconds });
      continue;
    }

    if (line.startsWith("[")) throw new Error(`Línea ${i + 1}: marca desconocida "${line}". Usa [pausa N].`);
    if (line.length > MAX_TEXT_CHARS) {
      throw new Error(`Línea ${i + 1}: el bloque tiene ${line.length} caracteres; divídelo (máximo ${MAX_TEXT_CHARS}).`);
    }
    if (steps[steps.length - 1]?.kind === "speech") steps.push({ kind: "pause", seconds: defaultPause });
    steps.push({ kind: "speech", text: line });
  }

  if (!steps.some((s) => s.kind === "speech")) throw new Error("El guion no tiene ningún texto para pronunciar.");

  return {
    title: meta["titulo"] ?? "Meditación",
    targetMinutes: meta["duracion_objetivo_min"] ? numberFrom(meta["duracion_objetivo_min"], 0, "duracion_objetivo_min") : undefined,
    voice: meta["voz"] || undefined,
    speed: meta["velocidad"] ? numberFrom(meta["velocidad"], 1, "velocidad") : undefined,
    instructions: meta["instrucciones"] || undefined,
    steps,
  };
}

function numberFrom(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`"${name}" debe ser un número (se recibió "${raw}").`);
  return value;
}
