import Fastify from "fastify";
import { QuotaService } from "../quota/service.js";
import { MemoryStore } from "../store/memory.js";
import type { DataStore } from "../store/types.js";
import type { AppContext } from "./context.js";
import { loadEnv, type ServerEnv } from "./env.js";
import { ApiError, registerErrorHandling } from "./errors.js";
import { RateLimiter } from "./rate-limit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerQuotaRoutes } from "./routes/quota.js";
import { TokenService } from "./tokens.js";

export interface AppOverrides {
  env?: ServerEnv;
  store?: DataStore;
  clock?: () => Date;
}

/** API general: 60 peticiones por minuto por usuario (docs/api.md, Límites). */
const REQUESTS_PER_MINUTE = 60;

export function buildApp(overrides: AppOverrides = {}) {
  const env = overrides.env ?? loadEnv();
  const clock = overrides.clock ?? (() => new Date());
  const store = overrides.store ?? new MemoryStore();

  const ctx: AppContext = {
    env,
    store,
    clock,
    tokens: new TokenService(env.jwtSecret, env.accessTokenSeconds, clock),
    quota: new QuotaService({ store, clock }),
  };

  const app = Fastify({
    // Las URLs se registran sin query: el ticket del WebSocket viaja ahí y no debe quedar en los logs.
    logger:
      env.nodeEnv === "test"
        ? false
        : { serializers: { req: (req) => ({ method: req.method, url: String(req.url).split("?")[0] }) } },
    // Confía solo en los N saltos de proxy configurados (Cloud Run = 1): así la IP del cliente no se puede falsificar con X-Forwarded-For.
    trustProxy: (_address: string, hop: number) => hop < env.trustProxyHops,
    bodyLimit: 64 * 1024,
  });

  registerErrorHandling(app);

  const userLimiter = new RateLimiter(REQUESTS_PER_MINUTE, 60 * 1000, () => clock().getTime());
  app.addHook("onRequest", async (request) => {
    if (request.is404 || request.routeOptions.config?.public) return;
    const header = request.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) throw new ApiError("unauthorized", "Falta el token de acceso");
    request.auth = await ctx.tokens.verify(match[1]!);
    const limit = userLimiter.check(request.auth.userId);
    if (!limit.allowed) {
      throw new ApiError("rate_limited", "Demasiadas peticiones. Espera un momento.", { retryAfterSeconds: limit.retryAfterSeconds });
    }
  });

  app.get("/health", { config: { public: true } }, async () => ({ status: "ok" }));
  app.get("/v1/version", { config: { public: true } }, async () => ({ name: "mind", apiVersion: 1 }));

  registerAuthRoutes(app, ctx);
  registerQuotaRoutes(app, ctx);

  return Object.assign(app, { ctx });
}
