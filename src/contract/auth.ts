import { z } from "zod";
import { IdSchema } from "./common.js";

/** POST /v1/auth/device: registra la instalación con el código de invitación. */
export const RegisterDeviceRequestSchema = z.object({
  inviteCode: z.string().min(1),
  /** Secreto aleatorio de 256 bits en base64url, generado por la app. El servidor guarda solo su hash. */
  deviceSecret: z.string().min(43).max(128),
  deviceName: z.string().max(80).optional(),
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
