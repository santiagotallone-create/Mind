import { z } from "zod";
import { IdSchema, LanguageSchema, TimezoneSchema } from "./common.js";

/** POST /v1/auth/device: registra la instalación con el código de invitación. */
export const RegisterDeviceRequestSchema = z.object({
  inviteCode: z.string().min(1),
  /** Secreto aleatorio de 256 bits en base64url, generado por la app. El servidor guarda solo su hash. */
  deviceSecret: z.string().min(43).max(128),
  deviceName: z.string().max(80).optional(),
  /**
   * Zona horaria del usuario (la app envía la del navegador). De ella depende la fecha de renovación del bolsón.
   * Si falta, el servidor usa Europe/Rome. Se corrige después con PATCH /v1/settings.
   */
  timezone: TimezoneSchema.optional(),
  /** Idioma de la app: `es` o `it`. La app del MVP envía siempre `es`; si falta, el servidor usa `es`. */
  locale: LanguageSchema.optional(),
});

/** POST /v1/auth/token: renueva el token de acceso. */
export const RefreshRequestSchema = z.object({
  deviceId: IdSchema,
  deviceSecret: z.string().min(43).max(128),
});

export const TokenResponseSchema = z.object({
  deviceId: IdSchema,
  accessToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
});

export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
