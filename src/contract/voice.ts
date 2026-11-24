import { z } from "zod";
import { IdSchema } from "./common.js";
import { ExperienceSchema } from "./profile.js";
import { TechniqueSchema } from "./plans.js";

/**
 * Charla en vivo con el coach.
 * 1) POST /v1/voice/tickets (comprueba el bolsón) -> ticket de un solo uso y 60 s.
 * 2) WebSocket wss://.../v1/voice?ticket=...
 *    - Cliente -> servidor: tramas binarias = audio PCM 16 bits, mono, 24 kHz; tramas de texto = mensajes JSON de control.
 *    - Servidor -> cliente: tramas binarias = audio del coach (mismo formato); tramas de texto = eventos JSON.
 */

export const TalkTypeSchema = z.enum(["libre", "entrevista", "cierre", "plan", "meditacion", "plan_nuevo"]);

export const VoiceTicketRequestSchema = z
  .object({
    talkType: TalkTypeSchema,
    planId: IdSchema.optional(),
    sessionId: IdSchema.optional(),
    /** Para reconectar tras un corte: continúa la misma charla en lugar de abrir otra. */
    resumeTalkId: IdSchema.optional(),
  })
  .refine((v) => v.talkType !== "plan" || v.planId, { message: "talkType plan requiere planId" })
  .refine((v) => !["meditacion", "cierre"].includes(v.talkType) || v.sessionId, {
    message: "talkType meditacion y cierre requieren sessionId",
  });

export const VoiceTicketResponseSchema = z.object({
  talkId: IdSchema,
  ticket: z.string(),
  wsUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});

/** Mensajes de control del cliente (tramas de texto). */
export const ClientControlMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("end") }),
]);

/** limite_duracion: la charla llegó al tope de 30 minutos continuos. */
export const EndReasonSchema = z.enum(["usuario", "cuota_agotada", "corte", "error", "inactividad", "limite_duracion"]);

/**
 * Códigos del evento `error` de la charla (distintos de los errores HTTP). La app decide por `retryable`, no por el texto.
 * - invalid_ticket, origin_not_allowed, rate_limited: el servidor no deja entrar al WebSocket (no reintentable con el mismo ticket).
 * - start_failed: el proveedor de voz no conectó; reintentable y no abre el periodo del bolsón.
 * - talk_not_found: la charla que se quiere retomar ya no existe.
 * - invalid_message: la app mandó un mensaje de control que el servidor no entiende.
 * - provider_error: el proveedor de voz falló en plena charla.
 */
export const VoiceErrorCodeSchema = z.enum([
  "invalid_ticket",
  "origin_not_allowed",
  "rate_limited",
  "start_failed",
  "talk_not_found",
  "invalid_message",
  "provider_error",
]);

/** Eventos del servidor (tramas de texto). */
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), talkId: IdSchema }),
  z.object({ type: z.literal("paused") }),
  z.object({ type: z.literal("resumed") }),
  /** El usuario empezó a hablar: la app corta el audio del coach que esté reproduciendo. */
  z.object({ type: z.literal("interrupted") }),
  /** Transcripción de uso interno. La app NO la muestra (no hay registros escritos de la charla). */
  z.object({ type: z.literal("transcript"), role: z.enum(["user", "coach"]), text: z.string() }),
  /** El coach está armando un plan: la app muestra «Armando tu plan…». */
  z.object({ type: z.literal("plan_creating") }),
  /**
   * El coach terminó de crear un plan. Trae el nombre y el número de sesiones para mostrar la tarjeta sin otra petición.
   * Tras una reconexión puede repetirse: la app descarta los que ya tiene por `planId`.
   */
  z.object({ type: z.literal("plan_created"), planId: IdSchema, name: z.string(), sessionsTotal: z.number().int().min(1) }),
  /**
   * El coach cerró la entrevista inicial. `planIds` son los planes que creó en ella (normalmente dos): la app los muestra juntos
   * en «Planes propuestos». Hasta las Olas 2 y 3 (crear_plan) el servidor no lo emite.
   */
  z.object({ type: z.literal("interview_completed"), planIds: z.array(IdSchema) }),
  /** El coach sugirió consultar a un profesional: la app muestra ese estado. */
  z.object({ type: z.literal("professional_help") }),
  z.object({ type: z.literal("error"), code: VoiceErrorCodeSchema, retryable: z.boolean() }),
  /** La charla terminó. cuota_agotada: el coach ya se despidió hablando. */
  z.object({ type: z.literal("ended"), reason: EndReasonSchema }),
]);

/**
 * Herramientas que el coach puede llamar. Este es el contrato; la implementación llega en las Olas 2 y 3.
 * `ajustar_velocidad` ya existe en la PoC.
 */
export const CoachToolsSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("ajustar_velocidad"),
    arguments: z.object({ velocidad: z.number().min(0.5).max(1.5) }),
  }),
  z.object({
    name: z.literal("crear_plan"),
    arguments: z.object({
      nombre: z.string().min(1).max(80),
      descripcion: z.string().max(400),
      sesiones: z
        .array(
          z.object({
            titulo: z.string().min(1).max(80),
            tecnica: TechniqueSchema,
            minutos_sugeridos: z.union([z.literal(5), z.literal(10), z.literal(15)]),
          }),
        )
        .min(1)
        .max(10),
    }),
  }),
  z.object({
    name: z.literal("ajustar_plan"),
    arguments: z.object({ plan_id: IdSchema, motivo: z.string().max(400) }),
  }),
  z.object({
    name: z.literal("guardar_perfil"),
    arguments: z.object({
      objetivos: z.string().max(1000).optional(),
      experiencia: ExperienceSchema.optional(),
      estado_actual: z.string().max(1000).optional(),
    }),
  }),
  z.object({ name: z.literal("marcar_entrevista_completa"), arguments: z.object({}) }),
]);

export type VoiceErrorCode = z.infer<typeof VoiceErrorCodeSchema>;
export type TalkType = z.infer<typeof TalkTypeSchema>;
export type VoiceTicketRequest = z.infer<typeof VoiceTicketRequestSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ClientControlMessage = z.infer<typeof ClientControlMessageSchema>;
export type CoachTool = z.infer<typeof CoachToolsSchema>;
