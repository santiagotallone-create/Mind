import Fastify from "fastify";

/** Servidor mínimo de la historia #3: comprobación de salud y versión. Las rutas de la API llegan en #5 y #6. */
export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/v1/version", async () => ({ name: "mind", apiVersion: 1 }));

  return app;
}
