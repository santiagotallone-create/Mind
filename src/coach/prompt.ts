import { readFile } from "node:fs/promises";
import { languageSettings, type Language } from "../config.js";

/** Carga el prompt del coach para el idioma pedido. */
export async function loadCoachPrompt(language: Language): Promise<string> {
  const file = new URL(`./prompts/${languageSettings[language].promptFile}`, import.meta.url);
  return readFile(file, "utf-8");
}
