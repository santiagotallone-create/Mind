import {
  CompleteSessionResponseSchema,
  PlanDetailResponseSchema,
  PlanListResponseSchema,
  PlanSummarySchema,
  SessionAudioResponseSchema,
  SessionSummarySchema,
  type CompleteSessionResponse,
  type Minutes,
  type PlanSummary,
  type SessionAudioResponse,
  type SessionSummary,
} from "../contract/index.js";
import { ApiError } from "../server/errors.js";
import type { DataStore, PlanRow, SessionRow } from "../store/types.js";

/** Cuánto dura la URL firmada de un audio. La app pide una nueva si la descarga empieza tarde o se interrumpe. */
export const AUDIO_URL_SECONDS = 3600;
/** Margen para el reloj del celular al enviar una sesión terminada sin conexión. */
export const CLOCK_SKEW_MS = 5 * 60_000;

const STATUS_ORDER = { activo: 0, completado: 1, archivado: 2 } as const;

export class PlanService {
  constructor(
    private readonly deps: { store: DataStore; clock: () => Date },
  ) {}

  /** Planes con progreso. Los archivados no se muestran; un plan completado sigue visible. */
  async listPlans(userId: string) {
    const [plans, sessions] = await Promise.all([this.deps.store.listPlans(userId), this.deps.store.listSessions(userId)]);
    const visible = plans
      .filter((p) => p.status !== "archivado")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.createdAt.getTime() - b.createdAt.getTime());
    return PlanListResponseSchema.parse({ plans: visible.map((p) => planSummary(p, sessions.filter((s) => s.planId === p.id))) });
  }

  async getPlan(userId: string, planId: string) {
    const [plan, sessions] = await Promise.all([this.deps.store.getPlan(userId, planId), this.deps.store.listSessions(userId, { planId })]);
    if (!plan) throw notFound("plan");
    return PlanDetailResponseSchema.parse({ plan: planSummary(plan, sessions), sessions: sessions.map(sessionSummary) });
  }

  /** Sesiones favoritas de planes que no están archivados. */
  async favorites(userId: string) {
    const sessions = await this.deps.store.listSessions(userId, { favoriteOnly: true });
    return { sessions: sessions.filter((s) => s.planStatus !== "archivado").map(sessionSummary).map((s) => SessionSummarySchema.parse(s)) };
  }

  async setFavorite(userId: string, sessionId: string, favorite: boolean): Promise<SessionSummary> {
    if (!(await this.deps.store.setFavorite(userId, sessionId, favorite))) throw notFound("sesión");
    return this.sessionById(userId, sessionId);
  }

  /** Idempotente. `completedAt` permite enviar una sesión terminada sin conexión; no puede ser futura. */
  async completeSession(userId: string, sessionId: string, completedAt?: Date): Promise<CompleteSessionResponse> {
    const now = this.deps.clock();
    if (completedAt && completedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      throw new ApiError("invalid_request", "completedAt no puede ser una fecha futura");
    }
    const at = completedAt && completedAt.getTime() < now.getTime() ? completedAt : now;
    if (!(await this.deps.store.completeSession(userId, sessionId, at))) throw notFound("sesión");
    const session = await this.sessionRowById(userId, sessionId);
    const [plan, sessions] = await Promise.all([this.deps.store.getPlan(userId, session.planId), this.deps.store.listSessions(userId, { planId: session.planId })]);
    return CompleteSessionResponseSchema.parse({ session: sessionSummary(session), plan: planSummary(plan!, sessions) });
  }

  /** Estado y URL firmada de un audio ya pedido. Para una duración que nunca se pidió: 404. */
  async getAudio(userId: string, sessionId: string, minutes: Minutes): Promise<SessionAudioResponse> {
    const audio = await this.deps.store.getAudio(userId, sessionId, minutes);
    if (!audio) throw notFound("audio");
    const empty = { minutes, url: null, expiresAt: null, format: null, bytes: null, durationSeconds: null, version: null };
    if (audio.status !== "lista") return SessionAudioResponseSchema.parse({ ...empty, status: audio.status });
    // Un audio «lista» sin archivo es un dato dañado: se informa como error, no como descarga imposible.
    if (!audio.storagePath) return SessionAudioResponseSchema.parse({ ...empty, status: "error" });
    const expiresAt = new Date(this.deps.clock().getTime() + AUDIO_URL_SECONDS * 1000);
    return SessionAudioResponseSchema.parse({
      status: "lista",
      minutes,
      url: await this.deps.store.signAudioUrl(audio.storagePath, AUDIO_URL_SECONDS),
      expiresAt: expiresAt.toISOString(),
      format: "m4a",
      bytes: audio.bytes,
      durationSeconds: audio.durationSeconds,
      version: audio.scriptHash,
    });
  }

  /** Comprueba que la sesión existe y es de la persona (para las rutas que no devuelven la sesión). */
  async assertSessionOwned(userId: string, sessionId: string): Promise<void> {
    await this.sessionRowById(userId, sessionId);
  }

  private async sessionRowById(userId: string, sessionId: string): Promise<SessionRow> {
    const [row] = await this.deps.store.listSessions(userId, { sessionId });
    if (!row) throw notFound("sesión");
    return row;
  }

  private async sessionById(userId: string, sessionId: string): Promise<SessionSummary> {
    return SessionSummarySchema.parse(sessionSummary(await this.sessionRowById(userId, sessionId)));
  }
}

function notFound(what: string): ApiError {
  return new ApiError("not_found", `No se encontró ${what === "plan" ? "ese plan" : what === "audio" ? "ese audio" : "esa sesión"}.`);
}

function planSummary(plan: PlanRow, sessions: SessionRow[]): PlanSummary {
  const ordered = [...sessions].sort((a, b) => a.position - b.position);
  const next = ordered.find((s) => s.doneAt === null);
  return PlanSummarySchema.parse({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    sessionsTotal: ordered.length,
    sessionsDone: ordered.filter((s) => s.doneAt !== null).length,
    nextSession: next ? { id: next.id, position: next.position, title: next.title, suggestedMinutes: next.suggestedMinutes } : null,
    createdAt: plan.createdAt.toISOString(),
    completedAt: plan.completedAt ? plan.completedAt.toISOString() : null,
  });
}

function sessionSummary(row: SessionRow): SessionSummary {
  const ready = row.audios.filter((a) => a.status === "lista").sort((a, b) => a.minutes - b.minutes);
  // Una versión por sesión: la del audio de la duración sugerida si está lista, y si no, la de la duración más corta.
  const versionSource = ready.find((a) => a.minutes === row.suggestedMinutes) ?? ready[0];
  return {
    id: row.id,
    planId: row.planId,
    planName: row.planName,
    position: row.position,
    title: row.title,
    technique: row.technique as SessionSummary["technique"],
    suggestedMinutes: row.suggestedMinutes as Minutes,
    done: row.doneAt !== null,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    favorite: row.favorite,
    availableMinutes: ready.map((a) => a.minutes as Minutes),
    audioVersion: versionSource?.scriptHash ?? null,
  };
}
