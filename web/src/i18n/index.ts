import { es } from "./es";

/** Claves del catálogo en notación de puntos («plans.title»), derivadas del propio catálogo. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof es>;
export type Params = Record<string, string | number>;

// Un solo idioma por ahora (MVP). Para sumar italiano: agregar «it» aquí con la misma forma.
const catalogs = { es } as const;
type Locale = keyof typeof catalogs;
let locale: Locale = "es";

export function setLocale(next: Locale) {
  locale = next;
}

/** Devuelve el texto de una clave, reemplazando {parámetros}. */
export function t(key: MessageKey, params?: Params): string {
  let node: unknown = catalogs[locale];
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  const text = typeof node === "string" ? node : key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
