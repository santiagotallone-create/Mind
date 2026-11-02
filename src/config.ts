export type Language = "es" | "it";
export type ProviderName = "openai-realtime" | "chain";

export interface AppConfig {
  language: Language;
  provider: ProviderName;
}

/** Valores por defecto del MVP: español y motor de extremo a extremo. */
export const defaultConfig: AppConfig = {
  language: "es",
  provider: "openai-realtime",
};

/** Cómo decide el motor que terminaste de hablar y que empezaste a interrumpir. */
export interface TurnDetectionConfig {
  /** "server": mide el silencio por volumen (configurable). "semantic": decide por el sentido de la frase. */
  mode: "server" | "semantic";
  /** Sensibilidad al sonido, de 0 a 1. Más alto = menos cortes falsos por ruido o eco. Solo modo "server". */
  threshold: number;
  /** Milisegundos de silencio antes de que el coach responda. Solo modo "server". */
  silenceMs: number;
  /** "low" espera más antes de responder. Solo modo "semantic". */
  eagerness: "low" | "medium" | "high" | "auto";
}

/** Valores pensados para evitar cortes falsos y dar más espacio a las pausas. */
export const defaultTurnDetection: TurnDetectionConfig = {
  mode: "server",
  threshold: 0.75,
  silenceMs: 1500,
  eagerness: "low",
};

/** Permite ajustar la detección desde .env sin tocar el código. */
export function turnDetectionFromEnv(): TurnDetectionConfig {
  const env = process.env;
  const mode = env.VOICE_TURN_MODE === "semantic" ? "semantic" : env.VOICE_TURN_MODE === "server" ? "server" : defaultTurnDetection.mode;
  const eagerness = (["low", "medium", "high", "auto"] as const).find((e) => e === env.VOICE_TURN_EAGERNESS);
  return {
    mode,
    threshold: Number(env.VOICE_TURN_THRESHOLD) || defaultTurnDetection.threshold,
    silenceMs: Number(env.VOICE_TURN_SILENCE_MS) || defaultTurnDetection.silenceMs,
    eagerness: eagerness ?? defaultTurnDetection.eagerness,
  };
}

/** Voz y reconocimiento por idioma. Sumar un idioma = agregar una entrada y un prompt. */
export const languageSettings: Record<Language, { voice: string; promptFile: string }> = {
  es: { voice: "marin", promptFile: "es.md" },
  it: { voice: "marin", promptFile: "it.md" },
};
