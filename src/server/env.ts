import { randomBytes } from "node:crypto";
import { DEFAULT_TIMEZONE } from "../quota/period.js";

/** Límites de la charla en vivo. Todos se pueden ajustar por entorno sin tocar el código. */
export interface VoiceLimits {
  /** Segundos sin que nadie hable antes de que el coach pregunte si la persona sigue ahí. */
  inactivityPromptSeconds: number;
  /** Segundos más, tras esa pregunta, antes de cerrar la charla. */
  inactivityCloseSeconds: number;
  /** Duración máxima de una charla (tiempo activo). */
  maxTalkSeconds: number;
  /** Cuánto puede durar una pausa. */
  pauseMaxSeconds: number;
  /** Cuánto se conserva la charla tras un corte de red. */
  reconnectGraceSeconds: number;
  /** Segundos que faltan para el fin del saldo (o del tope) cuando el coach se despide. */
  farewellWarningSeconds: number;
  /** Segundos extra, ya sin descontar, para que el coach termine de despedirse. */
  farewellMarginSeconds: number;
  /** Cada cuántos segundos se respalda el consumo en la base. */
  heartbeatSeconds: number;
  ticketTtlSeconds: number;
  /** Cuánto más rápido que el tiempo real se acepta audio de la app (protege el costo de la voz). */
  maxInboundAudioRate: number;
}

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
  voice: VoiceLimits;
  /** Orígenes (la dirección de la PWA) autorizados a llamar a la API desde un navegador. Vacío = ninguno. */
  allowedOrigins: string[];
  /** Dirección pública del servidor, si no se puede deducir de la petición. */
  publicUrl?: string;
  openaiApiKey?: string;
  /** Modelo de texto con el que se resumen las charlas. */
  summaryModel: string;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TEST_JWT_SECRET = "secreto-solo-para-pruebas-0123456789abcdef";

/** Lee y valida el entorno. En producción faltar una variable obligatoria detiene el arranque. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const nodeEnv = source.NODE_ENV === "production" ? "production" : source.NODE_ENV === "test" ? "test" : "development";
  const production = nodeEnv === "production";

  const missing = ["INVITE_CODE", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"].filter((name) => !source[name]);
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
    voice: {
      inactivityPromptSeconds: positiveNumber(source.VOICE_INACTIVITY_PROMPT_SECONDS, 60),
      inactivityCloseSeconds: positiveNumber(source.VOICE_INACTIVITY_CLOSE_SECONDS, 20),
      maxTalkSeconds: positiveNumber(source.VOICE_MAX_TALK_SECONDS, 30 * 60),
      pauseMaxSeconds: positiveNumber(source.VOICE_PAUSE_MAX_SECONDS, 10 * 60),
      reconnectGraceSeconds: positiveNumber(source.VOICE_RECONNECT_GRACE_SECONDS, 60),
      farewellWarningSeconds: positiveNumber(source.VOICE_FAREWELL_WARNING_SECONDS, 20),
      farewellMarginSeconds: positiveNumber(source.VOICE_FAREWELL_MARGIN_SECONDS, 10),
      heartbeatSeconds: positiveNumber(source.VOICE_HEARTBEAT_SECONDS, 10),
      ticketTtlSeconds: 60,
      maxInboundAudioRate: 1.25,
    },
    allowedOrigins: (source.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
    publicUrl: source.PUBLIC_URL || undefined,
    openaiApiKey: source.OPENAI_API_KEY || undefined,
    summaryModel: source.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini",
  };
}
