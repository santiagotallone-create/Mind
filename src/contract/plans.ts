import { z } from "zod";
import { IdSchema, IsoDateTimeSchema, MinutesSchema } from "./common.js";

export const TechniqueSchema = z.enum(["respiracion", "escaneo_corporal", "atencion_plena", "visualizacion", "otra"]);
export const PlanStatusSchema = z.enum(["activo", "completado", "archivado"]);
export const AudioStatusSchema = z.enum(["pendiente", "generando", "lista", "error"]);

export const SessionSummarySchema = z.object({
  id: IdSchema,
  planId: IdSchema,
  position: z.number().int().min(1),
  title: z.string(),
  technique: TechniqueSchema,
  suggestedMinutes: MinutesSchema,
  done: z.boolean(),
  doneAt: IsoDateTimeSchema.nullable(),
  favorite: z.boolean(),
  /** Duraciones con audio listo para descargar. */
  availableMinutes: z.array(MinutesSchema),
});

export const PlanSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string(),
  status: PlanStatusSchema,
  sessionsTotal: z.number().int().nonnegative(),
  sessionsDone: z.number().int().nonnegative(),
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

/** POST /v1/sessions/:id/complete: la app lo envía al llegar al final de la reproducción (D9, propuesta). */
export const CompleteSessionRequestSchema = z.object({ completedAt: IsoDateTimeSchema.optional() });

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
});

/** POST /v1/sessions/:id/audio: pide generar una duración (bajo demanda, con conexión). */
export const RequestAudioSchema = z.object({ minutes: MinutesSchema });

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type PlanDetailResponse = z.infer<typeof PlanDetailResponseSchema>;
export type SessionAudioResponse = z.infer<typeof SessionAudioResponseSchema>;
