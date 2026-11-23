import type { Language } from "../config.js";

/** Indicaciones que el servidor le da al coach en momentos puntuales. Una entrada por idioma. */
export interface VoiceStrings {
  /** Nadie habló durante un minuto. */
  inactivityPrompt: string;
  /** Se acaba el bolsón de minutos. */
  farewellQuota: string;
  /** La charla llegó a su duración máxima. */
  farewellLimit: string;
}

export const voiceStrings: Partial<Record<Language, VoiceStrings>> = {
  es: {
    inactivityPrompt: "La persona lleva un rato sin decir nada. Pregúntale con una sola frase muy breve y amable si sigue ahí.",
    farewellQuota:
      "Se terminó el tiempo de coach de este mes. Despídete ahora con una o dos frases breves y cálidas, di que volverán a hablar cuando se renueve el tiempo, y no hagas ninguna pregunta.",
    farewellLimit:
      "La charla llegó a su duración máxima. Despídete ahora con una o dos frases breves y cálidas, invítala a retomar cuando quiera, y no hagas ninguna pregunta.",
  },
};

export function stringsFor(language: Language): VoiceStrings {
  const strings = voiceStrings[language];
  if (!strings) throw new Error(`Idioma sin textos de voz: ${language}`);
  return strings;
}
