import { QuotaStatusSchema } from "../../contract/index.js";
import type { RouteRegistrar } from "../context.js";

export const registerQuotaRoutes: RouteRegistrar = (app, ctx) => {
  /** Minutos restantes, fecha de renovación y estado. El saldo exacto solo se muestra en Ajustes. */
  app.get("/v1/quota", async (request) => {
    const status = await ctx.quota.getStatus(request.auth!.userId);
    return QuotaStatusSchema.parse(status);
  });
};
