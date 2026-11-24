import { z } from "zod";
import {
  CompleteSessionRequestSchema,
  IdSchema,
  MinutesSchema,
  RequestAudioSchema,
  SetFavoriteRequestSchema,
} from "../../contract/index.js";
import type { RouteRegistrar } from "../context.js";
import { ApiError, parseOrThrow } from "../errors.js";

/** Un identificador que no es un UUID nunca existe: responde 404 como cualquier otro inexistente (y no llega a la base). */
function idParam(params: unknown): string {
  const id = (params as { id?: unknown }).id;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError("not_found", "No se encontró lo que pedías.");
  return parsed.data;
}

const AudioQuerySchema = z.object({ minutes: z.coerce.number().pipe(MinutesSchema) });

export const registerPlanRoutes: RouteRegistrar = (app, ctx) => {
  app.get("/v1/plans", async (request) => ctx.plans.listPlans(request.auth!.userId));

  app.get("/v1/plans/:id", async (request) => ctx.plans.getPlan(request.auth!.userId, idParam(request.params)));

  app.get("/v1/favorites", async (request) => ctx.plans.favorites(request.auth!.userId));

  app.put("/v1/sessions/:id/favorite", async (request) => {
    const id = idParam(request.params);
    const { favorite } = parseOrThrow(SetFavoriteRequestSchema, request.body);
    return ctx.plans.setFavorite(request.auth!.userId, id, favorite);
  });

  app.post("/v1/sessions/:id/complete", async (request) => {
    const id = idParam(request.params);
    const body = parseOrThrow(CompleteSessionRequestSchema, request.body ?? {});
    return ctx.plans.completeSession(request.auth!.userId, id, body.completedAt ? new Date(body.completedAt) : undefined);
  });

  app.get("/v1/sessions/:id/audio", async (request) => {
    const id = idParam(request.params);
    const { minutes } = parseOrThrow(AudioQuerySchema, request.query);
    return ctx.plans.getAudio(request.auth!.userId, id, minutes);
  });

  // No habilitada en el MVP: los audios los prepara Santi de antemano. La app no la llama.
  app.post("/v1/sessions/:id/audio", async (request) => {
    const id = idParam(request.params);
    parseOrThrow(RequestAudioSchema, request.body);
    await ctx.plans.assertSessionOwned(request.auth!.userId, id);
    throw new ApiError("offline_generation_unavailable", "La generación de audio bajo demanda no está disponible.");
  });
};
