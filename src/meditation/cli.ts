import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { buildMeditation } from "./build.js";
import { DEFAULT_TTS_MODEL, OpenAITtsProvider } from "./openai-tts.js";
import { parseScript } from "./script.js";
import { SimulatedSpeechProvider } from "./simulated.js";
import type { SpeechProvider } from "./speech.js";

/**
 * Referencia aproximada de costo de gpt-4o-mini-tts por minuto de audio.
 * Los precios por token están verificados (0,60 USD/M de texto y 12 USD/M de audio), pero la documentación
 * no da la equivalencia en minutos: contrasta siempre con la sección de uso de la cuenta de OpenAI.
 */
const REFERENCE_COST_PER_MINUTE_USD = 0.015;

function fmt(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const simulate = args.includes("--simular");
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) {
    console.error("Uso: npm run meditacion -- <nombre-del-guion> [--simular]\nEjemplo: npm run meditacion -- respiracion-5min");
    process.exit(1);
  }

  const scriptPath = name.endsWith(".md") ? name : join("meditaciones", `${name}.md`);
  let source: string;
  try {
    source = await readFile(scriptPath, "utf-8");
  } catch {
    console.error(`No encuentro el guion ${scriptPath}.`);
    process.exit(1);
  }
  const script = parseScript(source);
  const slug = basename(scriptPath, ".md");

  let provider: SpeechProvider;
  if (simulate) {
    provider = new SimulatedSpeechProvider();
    console.log("Modo simulado: sin voz real ni costo. Solo sirve para comprobar duraciones y silencios.");
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("Falta OPENAI_API_KEY en el archivo .env (o usa --simular para probar sin voz).");
      process.exit(1);
    }
    provider = new OpenAITtsProvider(apiKey, process.env.TTS_MODEL || DEFAULT_TTS_MODEL);
  }

  const outDir = "salida";
  await mkdir(outDir, { recursive: true });

  const result = await buildMeditation(script, provider, {
    voice: process.env.TTS_VOICE || "marin",
    speed: Number(process.env.TTS_SPEED) || 1,
    cacheDir: simulate ? undefined : join(outDir, "cache"),
    onProgress: (message) => console.log(message),
  });

  const wavPath = join(outDir, `${slug}${simulate ? "-simulado" : ""}.wav`);
  await writeFile(wavPath, result.wav);

  const estimatedCostUsd = simulate ? 0 : (result.generatedSeconds / 60) * REFERENCE_COST_PER_MINUTE_USD;
  const report = {
    guion: scriptPath,
    titulo: script.title,
    servicio: provider.id,
    voz: script.voice ?? process.env.TTS_VOICE ?? "marin",
    velocidad: script.speed ?? (Number(process.env.TTS_SPEED) || 1),
    duracionObjetivoMin: script.targetMinutes ?? null,
    duracionTotalSegundos: Math.round(result.totalSeconds),
    segundosDeVoz: Math.round(result.speechSeconds),
    segundosDeSilencio: Math.round(result.silenceSeconds),
    bloquesDeVoz: result.segments.length,
    caracteresGenerados: result.generatedChars,
    segundosDeAudioGenerados: Math.round(result.generatedSeconds),
    costoEstimadoUsd: Number(estimatedCostUsd.toFixed(4)),
    costoEsReferencia: !simulate,
    bloques: result.segments,
  };
  await writeFile(join(outDir, `${slug}${simulate ? "-simulado" : ""}.json`), JSON.stringify(report, null, 2));

  console.log(`\nListo: ${wavPath}`);
  console.log(`Duración total: ${fmt(result.totalSeconds)}${script.targetMinutes ? ` (objetivo ${script.targetMinutes} min)` : ""}`);
  console.log(`  Voz: ${fmt(result.speechSeconds)} | Silencio: ${fmt(result.silenceSeconds)}`);
  if (!simulate) {
    console.log(`Generado ahora: ${result.generatedChars} caracteres, ${fmt(result.generatedSeconds)} de audio.`);
    console.log(
      `Costo estimado: $${estimatedCostUsd.toFixed(4)} (referencia de ~$${REFERENCE_COST_PER_MINUTE_USD}/min, sin verificar: ` +
        `compáralo con la sección de uso de OpenAI). Lo reutilizado de la caché no cuesta.`,
    );
  }
}

main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
});
