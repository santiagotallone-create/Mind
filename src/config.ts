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

/** Voz y reconocimiento por idioma. Sumar un idioma = agregar una entrada y un prompt. */
export const languageSettings: Record<Language, { voice: string; promptFile: string }> = {
  es: { voice: "marin", promptFile: "es.md" },
  it: { voice: "marin", promptFile: "it.md" },
};
