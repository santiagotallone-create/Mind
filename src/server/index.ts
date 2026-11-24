import { createStore } from "../store/index.js";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = buildApp({ env, store: createStore(env) });

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
