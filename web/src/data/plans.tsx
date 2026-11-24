import type { PlanSummary, SessionSummary } from "@contract";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/**
 * Planes y sesiones en el teléfono. Es la fuente de las pantallas Inicio, Planes, Detalle, Antes de empezar y
 * reproductor. Hoy se inicia con datos simulados (los planes reales llegan con #7 y el almacenamiento en IndexedDB
 * con la sincronización); el resto de la app ya lo usa como lo hará con los datos reales.
 */
export type PlansState = { plans: PlanSummary[]; sessions: SessionSummary[] };

export class PlansStore {
  private state: PlansState;
  private listeners = new Set<() => void>();

  constructor(initial: PlansState) {
    this.state = initial;
  }

  getState = (): PlansState => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  private set(next: PlansState) {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }

  /** Marca o desmarca una sesión como favorita. Idempotente si se indica `value`. */
  setFavorite(sessionId: string, value: boolean) {
    this.set({ ...this.state, sessions: this.state.sessions.map((s) => (s.id === sessionId ? { ...s, favorite: value } : s)) });
  }

  /**
   * Cuenta una sesión como hecha (D9: al llegar al final de la meditación). Idempotente: repetirla no cambia `doneAt`.
   * Al completar la última sesión, el plan pasa a «completado».
   */
  completeSession(sessionId: string, at: Date = new Date()) {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session || session.done) return;
    const sessions = this.state.sessions.map((s) => (s.id === sessionId ? { ...s, done: true, doneAt: at.toISOString() } : s));
    const done = sessions.filter((s) => s.planId === session.planId && s.done).length;
    const plans = this.state.plans.map((p) => {
      if (p.id !== session.planId) return p;
      const completed = done >= p.sessionsTotal;
      return { ...p, sessionsDone: done, status: completed ? ("completado" as const) : p.status, completedAt: completed ? at.toISOString() : p.completedAt };
    });
    this.set({ plans, sessions });
  }
}

const Ctx = createContext<PlansStore | null>(null);

export function PlansProvider({ store, children }: { store: PlansStore; children: ReactNode }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePlansStore(): PlansStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("usePlansStore fuera de PlansProvider");
  return store;
}

export function usePlansState(): PlansState {
  const store = usePlansStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

// --- Consultas sobre el estado (puras) ---

export const sessionsOf = (s: PlansState, planId: string) => s.sessions.filter((x) => x.planId === planId).sort((a, b) => a.position - b.position);
export const planById = (s: PlansState, id: string) => s.plans.find((p) => p.id === id);
export const sessionById = (s: PlansState, id: string) => s.sessions.find((x) => x.id === id);
/** Primera sesión sin hacer, en orden. */
export const nextSessionOf = (s: PlansState, planId: string) => sessionsOf(s, planId).find((x) => !x.done);
export const favoritesOf = (s: PlansState) => s.sessions.filter((x) => x.favorite);
