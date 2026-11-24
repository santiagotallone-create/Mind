import { createStore } from "../store/index.js";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = buildApp({ env, store: createStore(env) });

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

// Cloud Run avisa con SIGTERM antes de apagar la instancia: se cierran las charlas abiertas y se guarda lo consumido.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Apagando el servidor");
    app
      .close()
      .catch((error) => app.log.error(error))
      .finally(() => process.exit(0));
  });
}
