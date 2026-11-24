import { RefreshRequestSchema, RegisterDeviceRequestSchema, TokenResponseSchema } from "../../contract/index.js";
import { ApiError, parseOrThrow } from "../errors.js";
import { RateLimiter } from "../rate-limit.js";
import type { RouteRegistrar } from "../context.js";
import { hashSecret, safeEqual } from "../tokens.js";

/** Registro: máximo 5 intentos por hora y dirección IP (docs/api.md, Límites). */
const REGISTER_ATTEMPTS_PER_HOUR = 5;
/** Hash de relleno para que la respuesta tarde lo mismo exista o no el dispositivo. */
const DUMMY_HASH = hashSecret("dispositivo-inexistente");

export const registerAuthRoutes: RouteRegistrar = (app, ctx) => {
  const registerLimiter = new RateLimiter(REGISTER_ATTEMPTS_PER_HOUR, 60 * 60 * 1000, () => ctx.clock().getTime());

  app.post("/v1/auth/device", { config: { public: true } }, async (request) => {
    const limit = registerLimiter.check(request.ip);
    if (!limit.allowed) {
      throw new ApiError("rate_limited", "Demasiados intentos de registro. Prueba más tarde.", { retryAfterSeconds: limit.retryAfterSeconds });
    }
    const body = parseOrThrow(RegisterDeviceRequestSchema, request.body);
    // Sin código configurado en el servidor nadie puede registrarse.
    if (!ctx.env.inviteCode || !safeEqual(body.inviteCode, ctx.env.inviteCode)) {
      throw new ApiError("invalid_invite", "Código de invitación inválido");
    }
    const { userId, deviceId } = await ctx.store.createUserWithDevice({
      secretHash: hashSecret(body.deviceSecret),
      deviceName: body.deviceName,
      timezone: body.timezone,
      locale: body.locale,
    });
    const accessToken = await ctx.tokens.issue({ userId, deviceId });
    return TokenResponseSchema.parse({ deviceId, accessToken, expiresInSeconds: ctx.tokens.expiresInSeconds });
  });

  app.post("/v1/auth/token", { config: { public: true } }, async (request) => {
    const body = parseOrThrow(RefreshRequestSchema, request.body);
    const device = await ctx.store.getDevice(body.deviceId);
    const secretMatches = safeEqual(hashSecret(body.deviceSecret), device?.secretHash ?? DUMMY_HASH);
    if (!device || device.revokedAt || !secretMatches) {
      throw new ApiError("unauthorized", "Credenciales inválidas");
    }
    // Si falla el registro de la última vez visto no se bloquea el ingreso.
    ctx.store.touchDevice(device.id, ctx.clock()).catch((error) => request.log.warn(error));
    const accessToken = await ctx.tokens.issue({ userId: device.userId, deviceId: device.id });
    return TokenResponseSchema.parse({ deviceId: device.id, accessToken, expiresInSeconds: ctx.tokens.expiresInSeconds });
  });
};
