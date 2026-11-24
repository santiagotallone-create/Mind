import { z } from "zod";

/** Esquemas compartidos por frontend y backend. Si cambian, se avisa a Santi antes (ver docs/api.md). */

export const LanguageSchema = z.enum(["es", "it"]);
export const IdSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
/** Fecha explícita AAAA-MM-DD, en la zona horaria del usuario. */
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Zona horaria IANA («Europe/Rome», «America/Argentina/Buenos_Aires») o «UTC». Se comprueba contra la base de zonas del motor,
 * así un nombre inventado no llega a calcular mal la fecha de renovación del bolsón.
 */
export const TimezoneSchema = z
  .string()
  .max(64)
  .regex(/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/, "Zona horaria IANA inválida")
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria IANA inválida");

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
