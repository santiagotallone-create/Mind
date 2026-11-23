import { z } from "zod";

/** Esquemas compartidos por frontend y backend. Si cambian, se avisa a Santi antes (ver docs/api.md). */

export const LanguageSchema = z.enum(["es", "it"]);
export const IdSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
/** Fecha explícita AAAA-MM-DD, en la zona horaria del usuario. */
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Duraciones permitidas de una meditación, en minutos. */
export const MinutesSchema = z.union([z.literal(5), z.literal(10), z.literal(15)]);

export const ErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "invalid_invite",
  "rate_limited",
  "not_found",
  "quota_exhausted",
  "offline_generation_unavailable",
  "internal",
]);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
  }),
});

export type Language = z.infer<typeof LanguageSchema>;
export type Minutes = z.infer<typeof MinutesSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
