import { createContext, useContext, type ReactNode } from "react";
import { ApiClient } from "./client";
import { DeviceAuth } from "./auth";
import { indexedDbStore } from "./storage";

/** Dirección del servidor. Vacía = mismo origen (la PWA se sirve desde el servidor de Cloud Run). */
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export function createApi(): ApiClient {
  const fetchFn: typeof fetch = (...args) => fetch(...args);
  return new ApiClient(new DeviceAuth(indexedDbStore(), baseUrl, fetchFn), baseUrl, fetchFn);
}

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ api, children }: { api: ApiClient | null; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

/** Cliente de la API, o null si la app corre sin servidor (pruebas y modo simulado). */
export function useApi(): ApiClient | null {
  return useContext(ApiContext);
}
