import type { FastifyInstance } from "fastify";
import type { PlanService } from "../plans/service.js";
import type { QuotaService } from "../quota/service.js";
import type { VoiceService } from "../voice/service.js";
import type { DataStore } from "../store/types.js";
import type { ServerEnv } from "./env.js";
import type { Identity, TokenService } from "./tokens.js";

/** Lo que comparten las rutas: configuración, datos, reloj y servicios. */
export interface AppContext {
  env: ServerEnv;
  store: DataStore;
  clock: () => Date;
  tokens: TokenService;
  quota: QuotaService;
  voice: VoiceService;
  plans: PlanService;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Quién hace la petición. Solo existe en rutas autenticadas. */
    auth?: Identity;
  }
  interface FastifyContextConfig {
    /** true = la ruta no exige token de acceso (registro, salud, versión, WebSocket con ticket). */
    public?: boolean;
  }
}

export type RouteRegistrar = (app: FastifyInstance, ctx: AppContext) => void;
