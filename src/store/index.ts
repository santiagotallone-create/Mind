import type { ServerEnv } from "../server/env.js";
import { MemoryStore } from "./memory.js";
import { SupabaseStore } from "./supabase.js";
import type { DataStore } from "./types.js";

/** Elige el almacén. En producción siempre es Supabase; el almacén en memoria solo existe para desarrollar y probar. */
export function createStore(env: ServerEnv): DataStore {
  if (env.supabaseUrl && env.supabaseServiceKey) {
    return SupabaseStore.create(env.supabaseUrl, env.supabaseServiceKey);
  }
  if (env.nodeEnv === "production") {
    throw new Error("Falta la configuración de Supabase (SUPABASE_URL y SUPABASE_SERVICE_KEY).");
  }
  console.warn("Sin SUPABASE_URL: se usa un almacén en memoria. Los datos se pierden al reiniciar.");
  return new MemoryStore();
}
