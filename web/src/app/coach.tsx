import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { QuotaStatus } from "@contract";
import { useApi } from "../api";
import { quotaAvailable, quotaExhausted } from "../mocks/data";

/**
 * Estado del coach: conexión y bolsón. Con servidor (`ApiProvider`) el bolsón viene de `GET /quota`;
 * sin servidor (pruebas y modo simulado) es el simulado. En desarrollo, /mapa permite forzar ambos.
 */
export type Override = { quotaOk?: boolean; online?: boolean };

type Coach = {
  online: boolean;
  /** Bolsón: null mientras no se conoce (cargando, sin conexión o teléfono sin registrar). */
  quota: QuotaStatus | null;
  /** Hay coach si hay conexión y el bolsón no está agotado. Si no se conoce el bolsón, el servidor decide al abrir la charla. */
  coachAvailable: boolean;
  override: Override;
  setOverride: (o: Override) => void;
};

const Ctx = createContext<Coach | null>(null);

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function CoachProvider({ children, initial }: { children: ReactNode; initial?: Override }) {
  const api = useApi();
  const realOnline = useOnline();
  const [override, setOverride] = useState<Override>(initial ?? {});
  const online = override.online ?? realOnline;

  const query = useQuery({
    queryKey: ["quota"],
    queryFn: () => api!.getQuota(),
    enabled: api !== null && online && override.quotaOk === undefined,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const value = useMemo<Coach>(() => {
    let quota: QuotaStatus | null;
    if (override.quotaOk !== undefined) quota = override.quotaOk ? quotaAvailable : quotaExhausted;
    else if (api === null) quota = quotaAvailable; // modo simulado
    else quota = query.data ?? null;
    return { online, quota, coachAvailable: online && quota?.state !== "agotado", override, setOverride };
  }, [online, override, api, query.data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoach(): Coach {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCoach fuera de CoachProvider");
  return v;
}
