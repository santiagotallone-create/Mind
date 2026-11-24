import { readFile } from "node:fs/promises";
import { languageSettings, type Language } from "../config.js";
import type { TalkType } from "../contract/index.js";

export interface ParsedPrompt {
  /** Personalidad y límites, comunes a todas las charlas. */
  base: string;
  /** Una sección por tipo de charla (`## tipo: libre`, ...). */
  sections: Map<string, string>;
}

const cache = new Map<Language, ParsedPrompt>();
const SECTION = /^## tipo: (\w+)\s*$/;

/** Separa el archivo del idioma en la parte común y las secciones por tipo de charla. */
export function parsePrompt(text: string): ParsedPrompt {
  const base: string[] = [];
  const sections = new Map<string, string[]>();
  let current: string[] = base;
  for (const line of text.split("\n")) {
    const match = SECTION.exec(line);
    if (match) {
      current = [];
      sections.set(match[1]!, current);
    } else {
      current.push(line);
    }
  }
  return {
    base: base.join("\n").trim(),
    sections: new Map([...sections].map(([name, lines]) => [name, lines.join("\n").trim()])),
  };
}

/** Carga el prompt del coach de un idioma. Hay un archivo por idioma en src/coach/prompts/. */
export async function loadPrompt(language: Language): Promise<ParsedPrompt> {
  const cached = cache.get(language);
  if (cached) return cached;
  const file = new URL(`./prompts/${languageSettings[language].promptFile}`, import.meta.url);
  const parsed = parsePrompt(await readFile(file, "utf-8"));
  cache.set(language, parsed);
  return parsed;
}

/** Prompt completo para un tipo de charla (la prueba de concepto usa `libre`). */
export async function loadCoachPrompt(language: Language, talkType: TalkType = "libre"): Promise<string> {
  const { base, sections } = await loadPrompt(language);
  const section = sections.get(talkType);
  return section ? `${base}\n\n${section}` : base;
}
