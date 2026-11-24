import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, MinutesSchema } from "./common.js";

export const TechniqueSchema = z.enum(["respiracion", "escaneo_corporal", "atencion_plena", "visualizacion", "otra"]);
export const PlanStatusSchema = z.enum(["activo", "completado", "archivado"]);
export const AudioStatusSchema = z.enum(["pendiente", "generando", "lista", "error"]);

export const SessionSummarySchema = z.object({
  id: IdSchema,
  planId: IdSchema,
  /** Nombre del plan al que pertenece la sesión: lo muestran el reproductor («Soltar la tensión · Sesión 3») y las favoritas. */
  planName: z.string(),
  position: z.number().int().min(1),
  title: z.string(),
  technique: TechniqueSchema,
  suggestedMinutes: MinutesSchema,
  done: z.boolean(),
  doneAt: IsoDateTimeSchema.nullable(),
  favorite: z.boolean(),
  /** Duraciones con audio listo para descargar. */
  availableMinutes: z.array(MinutesSchema),
  /**
   * Versión vigente del guion de esta sesión (texto opaco; es el hash del guion). Si cambia (el coach ajustó el plan y se
   * regeneró el audio), la copia descargada en el celular quedó vieja: se descarta y se descarga de nuevo.
   * null mientras no hay ningún audio listo.
   */
  audioVersion: z.string().nullable(),
});

/** La próxima sesión de un plan, para mostrarla en la tarjeta sin pedir el detalle: «Siguiente: escaneo corporal · 10 min». */
export const NextSessionSchema = z.object({
  id: IdSchema,
  position: z.number().int().min(1),
  title: z.string(),
  suggestedMinutes: MinutesSchema,
});

export const PlanSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  status: PlanStatusSchema,
  sessionsTotal: z.number().int().nonnegative(),
  sessionsDone: z.number().int().nonnegative(),
  /** La primera sesión sin hacer, por posición. null cuando el plan está completado. */
  nextSession: NextSessionSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
});

/** GET /v1/plans */
export const PlanListResponseSchema = z.object({ plans: z.array(PlanSummarySchema) });

/** GET /v1/plans/:id */
export const PlanDetailResponseSchema = z.object({
  plan: PlanSummarySchema,
  sessions: z.array(SessionSummarySchema),
});

/** GET /v1/favorites */
export const FavoritesResponseSchema = z.object({ sessions: z.array(SessionSummarySchema) });

/** PUT /v1/sessions/:id/favorite */
export const SetFavoriteRequestSchema = z.object({ favorite: z.boolean() });
/** Respuesta de PUT /v1/sessions/:id/favorite: la sesión ya actualizada. Es idempotente. */
export const SetFavoriteResponseSchema = SessionSummarySchema;

/**
 * POST /v1/sessions/:id/complete: la app lo envía al llegar al final de la reproducción (D9, propuesta).
 * Si la persona terminó sin conexión, la app lo manda después con `completedAt` (no puede ser futuro).
 */
export const CompleteSessionRequestSchema = z.object({ completedAt: IsoDateTimeSchema.optional() });
/**
 * Respuesta de POST /v1/sessions/:id/complete: la sesión y su plan ya actualizados (el plan pasa a `completado` al hacer la última).
 * Es idempotente: repetirlo no cambia `doneAt`.
 */
export const CompleteSessionResponseSchema = z.object({
  session: SessionSummarySchema,
  plan: PlanSummarySchema,
});

/** GET /v1/sessions/:id/audio?minutes=10 */
export const SessionAudioResponseSchema = z.object({
  status: AudioStatusSchema,
  minutes: MinutesSchema,
  /** URL firmada de descarga. Solo cuando status = lista. */
  url: z.string().url().nullable(),
  expiresAt: IsoDateTimeSchema.nullable(),
  format: z.literal("m4a").nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  /** Versión del guion con el que se hizo este audio (el mismo valor que `audioVersion` de la sesión). null si no está lista. */
  version: z.string().nullable(),
});

/**
 * POST /v1/sessions/:id/audio: pide generar una duración (bajo demanda, con conexión).
 * No está habilitada en el MVP: los audios los prepara Santi de antemano y esta ruta responde siempre
 * 503 `offline_generation_unavailable`. La app no la usa y solo ofrece las duraciones de `availableMinutes`.
 */
export const RequestAudioSchema = z.object({ minutes: MinutesSchema });
/** Respuesta de POST /v1/sessions/:id/audio cuando la generación esté habilitada: 202 con `pendiente` o `generando`, 200 si ya está `lista`. */
export const RequestAudioResponseSchema = SessionAudioResponseSchema;

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type NextSession = z.infer<typeof NextSessionSchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type PlanDetailResponse = z.infer<typeof PlanDetailResponseSchema>;
export type SessionAudioResponse = z.infer<typeof SessionAudioResponseSchema>;
export type CompleteSessionResponse = z.infer<typeof CompleteSessionResponseSchema>;
