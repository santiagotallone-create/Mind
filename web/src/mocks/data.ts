import type { Minutes, PlanSummary, Profile, QuotaStatus, SessionSummary } from "@contract";

/**
 * Datos simulados para trabajar sin backend. Siguen la forma exacta del contrato (src/contract).
 * Los nombres de planes, sesiones, minutos y valores de perfil son los de ejemplo del prototipo.
 */

export const PLAN_TENSION = "11111111-1111-4111-8111-111111111111";
export const PLAN_SLEEP = "22222222-2222-4222-8222-222222222222";

const sessionId = (plan: 1 | 2, n: number) => `${plan}${plan}${plan}${plan}${plan}${plan}${plan}${plan}-0000-4000-8000-00000000000${n}`;

type SessionSeed = Pick<SessionSummary, "title" | "technique" | "suggestedMinutes"> & { favorite?: boolean };

function buildSessions(planId: string, plan: 1 | 2, seeds: SessionSeed[], done: number): SessionSummary[] {
  return seeds.map((s, i) => ({
    id: sessionId(plan, i + 1),
    planId,
    position: i + 1,
    title: s.title,
    technique: s.technique,
    suggestedMinutes: s.suggestedMinutes,
    done: i < done,
    doneAt: i < done ? `2026-11-${String(10 + i).padStart(2, "0")}T07:30:00+01:00` : null,
    favorite: s.favorite ?? false,
    availableMinutes: [s.suggestedMinutes],
  }));
}

export const sessions: SessionSummary[] = [
  ...buildSessions(
    PLAN_TENSION,
    1,
    [
      { title: "Respiración consciente", technique: "respiracion", suggestedMinutes: 5, favorite: true },
      { title: "Atención plena", technique: "atencion_plena", suggestedMinutes: 10 },
      { title: "Escaneo corporal", technique: "escaneo_corporal", suggestedMinutes: 10, favorite: true },
      { title: "Visualización", technique: "visualizacion", suggestedMinutes: 15 },
      { title: "Relajación profunda", technique: "otra", suggestedMinutes: 10 },
    ],
    2,
  ),
  ...buildSessions(
    PLAN_SLEEP,
    2,
    [
      { title: "Respiración lenta", technique: "respiracion", suggestedMinutes: 15 },
      { title: "Relajación muscular", technique: "otra", suggestedMinutes: 15 },
      { title: "Escaneo corporal", technique: "escaneo_corporal", suggestedMinutes: 10 },
      { title: "Visualización", technique: "visualizacion", suggestedMinutes: 15 },
      { title: "Atención plena", technique: "atencion_plena", suggestedMinutes: 10 },
    ],
    0,
  ),
];

function planSummary(id: string, name: string, description: string): PlanSummary {
  const own = sessions.filter((s) => s.planId === id);
  const done = own.filter((s) => s.done).length;
  return {
    id,
    name,
    description,
    status: done === own.length ? "completado" : "activo",
    sessionsTotal: own.length,
    sessionsDone: done,
    createdAt: "2026-11-09T18:00:00+01:00",
    completedAt: null,
  };
}

export const plans: PlanSummary[] = [
  planSummary(PLAN_TENSION, "Soltar la tensión", "Cinco sesiones para aflojar el cuerpo."),
  planSummary(PLAN_SLEEP, "Dormir mejor", "Cinco sesiones para llegar a la noche con calma."),
];

export const profile: Profile = {
  goals: "Soltar la tensión y dormir mejor",
  experience: "principiante",
  currentState: "Mucho ritmo de trabajo",
  interviewCompletedAt: "2026-11-09T17:50:00+01:00",
};

export const quotaAvailable: QuotaStatus = {
  state: "disponible",
  secondsTotal: 7200,
  secondsRemaining: 3000,
  minutesRemaining: 50,
  periodStartsAt: "2026-11-01T09:00:00+01:00",
  renewsOn: "2026-12-01",
};

export const quotaExhausted: QuotaStatus = {
  ...quotaAvailable,
  state: "agotado",
  secondsRemaining: 0,
  minutesRemaining: 0,
};

export const quotaNotStarted: QuotaStatus = {
  state: "sin_iniciar",
  secondsTotal: 7200,
  secondsRemaining: 7200,
  minutesRemaining: 120,
  periodStartsAt: null,
  renewsOn: null,
};

export const DURATIONS: readonly Minutes[] = [5, 10, 15];

/** Estado inicial simulado: dos planes activos, el primero con 2 de 5 sesiones hechas. */
export const seedState = (): { plans: PlanSummary[]; sessions: SessionSummary[] } => ({
  plans: plans.map((p) => ({ ...p })),
  sessions: sessions.map((s) => ({ ...s })),
});
