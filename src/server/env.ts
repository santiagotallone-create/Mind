import { randomBytes } from "node:crypto";
import { DEFAULT_TIMEZONE } from "../quota/period.js";

export interface ServerEnv {
  nodeEnv: "production" | "development" | "test";
  port: number;
  /** Código de invitación para registrar un celular. Vacío = nadie puede registrarse. */
  inviteCode: string;
  jwtSecret: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  /** Cuántos proxies de confianza hay delante del servidor (Cloud Run = 1). Define de dónde sale la IP del cliente. */
  trustProxyHops: number;
  accessTokenSeconds: number;
  defaultTimezone: string;
}

const TEST_JWT_SECRET = "secreto-solo-para-pruebas-0123456789abcdef";

/** Lee y valida el entorno. En producción faltar una variable obligatoria detiene el arranque. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const nodeEnv = source.NODE_ENV === "production" ? "production" : source.NODE_ENV === "test" ? "test" : "development";
  const production = nodeEnv === "production";

  const missing = ["INVITE_CODE", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((name) => !source[name]);
  if (production && missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(", ")}`);
  }

  let jwtSecret = source.JWT_SECRET;
  if (jwtSecret && jwtSecret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }
  if (!jwtSecret) {
    // Fuera de producción: en pruebas un valor fijo; en desarrollo uno aleatorio (los tokens no sobreviven a un reinicio).
    jwtSecret = nodeEnv === "test" ? TEST_JWT_SECRET : randomBytes(32).toString("base64url");
  }

  return {
    nodeEnv,
    port: Number(source.PORT) || 8080,
    inviteCode: source.INVITE_CODE ?? (nodeEnv === "test" ? "codigo-de-prueba" : ""),
    jwtSecret,
    supabaseUrl: source.SUPABASE_URL || undefined,
    supabaseServiceKey: source.SUPABASE_SERVICE_KEY || undefined,
    trustProxyHops: source.TRUST_PROXY_HOPS !== undefined ? Number(source.TRUST_PROXY_HOPS) : production ? 1 : 0,
    accessTokenSeconds: 15 * 60,
    defaultTimezone: DEFAULT_TIMEZONE,
  };
}
