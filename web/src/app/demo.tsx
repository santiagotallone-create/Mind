import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { quotaAvailable, quotaExhausted } from "../mocks/data";

/**
 * Estado simulado del coach (bolsón y conexión) mientras no hay backend.
 * Se reemplaza por datos reales (TanStack Query + estado de red) en las historias de datos.
 */
type Demo = {
  quotaOk: boolean;
  online: boolean;
  setQuotaOk: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  quota: typeof quotaAvailable;
  coachAvailable: boolean;
};

const Ctx = createContext<Demo | null>(null);

export function DemoProvider({ children, initial }: { children: ReactNode; initial?: { quotaOk?: boolean; online?: boolean } }) {
  const [quotaOk, setQuotaOk] = useState(initial?.quotaOk ?? true);
  const [online, setOnline] = useState(initial?.online ?? true);
  const value = useMemo<Demo>(
    () => ({ quotaOk, online, setQuotaOk, setOnline, quota: quotaOk ? quotaAvailable : quotaExhausted, coachAvailable: quotaOk && online }),
    [quotaOk, online],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): Demo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemo fuera de DemoProvider");
  return v;
}
