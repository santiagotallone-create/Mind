import { randomUUID } from "node:crypto";
import type { Language, TalkType } from "../contract/index.js";
import type {
  DataStore,
  DeviceRecord,
  Experience,
  MemoryEntry,
  PendingTranscript,
  PlanContext,
  PlanRow,
  PlanStatus,
  AudioRow,
  SessionRow,
  ProfileRecord,
  ProgressSnapshot,
  QuotaPeriod,
  SessionContext,
  SettingsRecord,
  TalkRecord,
  TranscriptTurn,
  UsageByType,
  UserRecord,
} from "./types.js";

interface MemoryPlan {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}
interface MemorySession {
  id: string;
  userId: string;
  planId: string;
  position: number;
  title: string;
  technique: string;
  suggestedMinutes: number;
  doneAt: Date | null;
  favorite: boolean;
}

function toPlanRow(p: MemoryPlan): PlanRow {
  return { id: p.id, name: p.name, description: p.description, status: p.status as PlanStatus, createdAt: p.createdAt, completedAt: p.completedAt };
}

/**
 * Almacén en memoria: sirve para las pruebas y para desarrollar sin Supabase.
 * Reproduce las mismas reglas que las funciones SQL de supabase/migrations/0002_bolson.sql.
 * No se usa en producción (ver createStore).
 */
export class MemoryStore implements DataStore {
  readonly users = new Map<string, UserRecord>();
  readonly devices = new Map<string, DeviceRecord>();
  readonly periods = new Map<string, QuotaPeriod>();
  readonly talks = new Map<string, TalkRecord>();
  readonly profiles = new Map<string, ProfileRecord>();
  readonly settings = new Map<string, SettingsRecord>();
  readonly plans = new Map<string, MemoryPlan>();
  readonly sessions = new Map<string, MemorySession>();
  readonly transcripts = new Map<string, TranscriptTurn[]>();
  readonly audios: (AudioRow & { sessionId: string; userId: string })[] = [];
  private planCounter = 0;
  readonly memory: (MemoryEntry & { userId: string })[] = [];

  async createUserWithDevice(input: { secretHash: string; deviceName?: string; timezone?: string; locale?: Language }) {
    const userId = randomUUID();
    const deviceId = randomUUID();
    const timezone = input.timezone ?? "Europe/Rome";
    const locale = input.locale ?? "es";
    this.users.set(userId, { id: userId, timezone, locale });
    this.profiles.set(userId, { goals: "", experience: null, currentState: "", interviewCompletedAt: null });
    this.settings.set(userId, { locale, timezone, voiceSpeed: 1 });
    this.devices.set(deviceId, { id: deviceId, userId, secretHash: input.secretHash, revokedAt: null });
    return { userId, deviceId };
  }

  async getDevice(deviceId: string) {
    const device = this.devices.get(deviceId);
    return device ? { ...device } : null;
  }

  async touchDevice(): Promise<void> {}

  async getUser(userId: string) {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  private findOpenPeriod(userId: string, now: Date): QuotaPeriod | undefined {
    return [...this.periods.values()]
      .filter((p) => p.userId === userId && p.startsAt <= now && p.endsAt > now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  }

  async getOpenPeriod(userId: string, now: Date) {
    const open = this.findOpenPeriod(userId, now);
    return open ? { ...open } : null;
  }

  async openPeriod(input: { userId: string; now: Date; endsAt: Date; secondsTotal: number }) {
    // Sin esperas entre comprobar y crear: es lo que hace atómica la apertura (en SQL lo garantiza el bloqueo del usuario).
    const existing = this.findOpenPeriod(input.userId, input.now);
    if (existing) return { ...existing };
    const period: QuotaPeriod = {
      id: randomUUID(),
      userId: input.userId,
      startsAt: input.now,
      endsAt: input.endsAt,
      secondsTotal: input.secondsTotal,
      secondsUsed: 0,
    };
    this.periods.set(period.id, period);
    return { ...period };
  }

  async chargeTalk(input: { talkId: string; periodId: string; activeSeconds: number }) {
    const talk = this.talks.get(input.talkId);
    if (!talk) throw new Error(`Charla ${input.talkId} no existe`);
    const period = this.periods.get(input.periodId);
    if (!period) throw new Error(`Periodo ${input.periodId} no existe`);
    if (period.userId !== talk.userId) throw new Error("La charla y el periodo son de usuarios distintos");
    const delta = Math.max(0, input.activeSeconds - talk.activeSeconds);
    talk.activeSeconds = Math.max(talk.activeSeconds, input.activeSeconds);
    talk.quotaPeriodId ??= input.periodId;
    period.secondsUsed = Math.min(period.secondsTotal, period.secondsUsed + delta);
    return { ...period };
  }

  async createTalk(input: { userId: string; type: TalkType; planId?: string; sessionId?: string; startedAt?: Date }) {
    const talk: TalkRecord = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      planId: input.planId ?? null,
      sessionId: input.sessionId ?? null,
      startedAt: input.startedAt ?? new Date(),
      endedAt: null,
      activeSeconds: 0,
      endReason: null,
      quotaPeriodId: null,
      metrics: {},
    };
    this.talks.set(talk.id, talk);
    return { ...talk };
  }

  async getTalk(userId: string, talkId: string) {
    const talk = this.talks.get(talkId);
    return talk && talk.userId === userId ? { ...talk } : null;
  }

  async closeTalk(talkId: string, input: { endedAt: Date; endReason: string; metrics?: Record<string, unknown> }) {
    const talk = this.talks.get(talkId);
    if (!talk) return;
    talk.endedAt = input.endedAt;
    talk.endReason = input.endReason;
    if (input.metrics) talk.metrics = input.metrics;
  }

  async usageByType(userId: string, periodId: string): Promise<UsageByType[]> {
    const byType = new Map<TalkType, UsageByType>();
    for (const talk of this.talks.values()) {
      if (talk.userId !== userId || talk.quotaPeriodId !== periodId) continue;
      const row = byType.get(talk.type) ?? { type: talk.type, talks: 0, activeSeconds: 0 };
      row.talks += 1;
      row.activeSeconds += talk.activeSeconds;
      byType.set(talk.type, row);
    }
    return [...byType.values()];
  }

  // --- Coach: perfil, ajustes, progreso y memoria interna ---

  async getProfile(userId: string) {
    return { ...(this.profiles.get(userId) ?? { goals: "", experience: null, currentState: "", interviewCompletedAt: null }) };
  }

  async updateProfile(userId: string, patch: { goals?: string; experience?: Experience; currentState?: string }) {
    const current = await this.getProfile(userId);
    this.profiles.set(userId, {
      ...current,
      ...(patch.goals !== undefined ? { goals: patch.goals } : {}),
      ...(patch.experience !== undefined ? { experience: patch.experience } : {}),
      ...(patch.currentState !== undefined ? { currentState: patch.currentState } : {}),
    });
  }

  async markInterviewComplete(userId: string, at: Date) {
    const current = await this.getProfile(userId);
    this.profiles.set(userId, { ...current, interviewCompletedAt: at });
  }

  async getSettings(userId: string) {
    return { ...(this.settings.get(userId) ?? { locale: "es" as const, timezone: "Europe/Rome", voiceSpeed: 1 }) };
  }

  async updateVoiceSpeed(userId: string, speed: number) {
    const current = await this.getSettings(userId);
    this.settings.set(userId, { ...current, voiceSpeed: speed });
  }

  /** Solo para pruebas: los planes y sesiones los crea el coach en las Olas 2 y 3. */
  addPlan(userId: string, input: { name: string; description?: string; status?: string }): string {
    const id = randomUUID();
    // Cada plan nace un minuto después del anterior, para que el orden sea el de creación.
    const createdAt = new Date(Date.UTC(2026, 0, 1) + this.planCounter++ * 60_000);
    this.plans.set(id, { id, userId, name: input.name, description: input.description ?? "", status: input.status ?? "activo", createdAt, completedAt: null });
    return id;
  }

  addSession(userId: string, planId: string, input: { title: string; technique?: string; suggestedMinutes?: number; doneAt?: Date | null; favorite?: boolean }): string {
    const id = randomUUID();
    const position = [...this.sessions.values()].filter((x) => x.planId === planId).length + 1;
    this.sessions.set(id, {
      id,
      userId,
      planId,
      position,
      title: input.title,
      technique: input.technique ?? "respiracion",
      suggestedMinutes: input.suggestedMinutes ?? 10,
      doneAt: input.doneAt ?? null,
      favorite: input.favorite ?? false,
    });
    return id;
  }

  /** Solo para pruebas: los audios los prepara Santi de antemano. */
  addAudio(userId: string, sessionId: string, input: Partial<AudioRow> & { minutes: number }): void {
    this.audios.push({
      userId,
      sessionId,
      status: "lista",
      storagePath: `${userId}/${sessionId}/${input.minutes}.m4a`,
      bytes: 4_000_000,
      durationSeconds: input.minutes * 60,
      scriptHash: "hash-1",
      ...input,
    });
  }

  async listPlans(userId: string): Promise<PlanRow[]> {
    return [...this.plans.values()].filter((p) => p.userId === userId).map(toPlanRow);
  }

  async getPlan(userId: string, planId: string): Promise<PlanRow | null> {
    const plan = this.plans.get(planId);
    return plan && plan.userId === userId ? toPlanRow(plan) : null;
  }

  async listSessions(userId: string, filter: { planId?: string; sessionId?: string; favoriteOnly?: boolean } = {}): Promise<SessionRow[]> {
    return [...this.sessions.values()]
      .filter((x) => x.userId === userId)
      .filter((x) => !filter.planId || x.planId === filter.planId)
      .filter((x) => !filter.sessionId || x.id === filter.sessionId)
      .filter((x) => !filter.favoriteOnly || x.favorite)
      .map((x) => {
        const plan = this.plans.get(x.planId)!;
        return {
          id: x.id,
          planId: x.planId,
          planName: plan.name,
          planStatus: plan.status as PlanStatus,
          planCreatedAt: plan.createdAt,
          position: x.position,
          title: x.title,
          technique: x.technique,
          suggestedMinutes: x.suggestedMinutes,
          doneAt: x.doneAt,
          favorite: x.favorite,
          audios: this.audios.filter((a) => a.sessionId === x.id).map(({ sessionId: _s, userId: _u, ...audio }) => audio),
        };
      })
      .sort((a, b) => a.planCreatedAt.getTime() - b.planCreatedAt.getTime() || a.position - b.position);
  }

  async setFavorite(userId: string, sessionId: string, favorite: boolean): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return false;
    session.favorite = favorite;
    return true;
  }

  // Sin awaits entre la lectura y la escritura: es atómico igual que la función SQL complete_session.
  async completeSession(userId: string, sessionId: string, at: Date): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return false;
    session.doneAt ??= at;
    const plan = this.plans.get(session.planId)!;
    const pending = [...this.sessions.values()].some((x) => x.planId === plan.id && x.doneAt === null);
    if (plan.status === "activo" && !pending) {
      plan.status = "completado";
      plan.completedAt ??= at;
    }
    return true;
  }

  async getAudio(userId: string, sessionId: string, minutes: number): Promise<AudioRow | null> {
    const audio = this.audios.find((a) => a.userId === userId && a.sessionId === sessionId && a.minutes === minutes);
    if (!audio) return null;
    const { sessionId: _s, userId: _u, ...row } = audio;
    return row;
  }

  async signAudioUrl(storagePath: string, expiresInSeconds: number): Promise<string> {
    return `https://storage.test/meditaciones/${storagePath}?token=firmado&expires=${expiresInSeconds}`;
  }

  async getProgress(userId: string): Promise<ProgressSnapshot> {
    const plans = [...this.plans.values()].filter((p) => p.userId === userId);
    const sessions = [...this.sessions.values()].filter((x) => x.userId === userId);
    const done = sessions.filter((x) => x.doneAt);
    return {
      activePlans: plans
        .filter((p) => p.status === "activo")
        .map((p) => {
          const own = sessions.filter((x) => x.planId === p.id);
          return { id: p.id, name: p.name, sessionsDone: own.filter((x) => x.doneAt).length, sessionsTotal: own.length };
        }),
      completedPlans: plans.filter((p) => p.status === "completado").length,
      sessionsDoneTotal: done.length,
      lastSessionDoneAt: done.reduce<Date | null>((latest, x) => (!latest || x.doneAt! > latest ? x.doneAt : latest), null),
    };
  }

  async getSessionContext(userId: string, sessionId: string): Promise<SessionContext | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) return null;
    const plan = this.plans.get(session.planId);
    return {
      id: session.id,
      planId: session.planId,
      planName: plan?.name ?? "",
      title: session.title,
      technique: session.technique,
      suggestedMinutes: session.suggestedMinutes,
      doneAt: session.doneAt,
    };
  }

  async getPlanContext(userId: string, planId: string): Promise<PlanContext | null> {
    const plan = this.plans.get(planId);
    if (!plan || plan.userId !== userId) return null;
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      sessions: [...this.sessions.values()]
        .filter((x) => x.planId === planId)
        .sort((a, b) => a.position - b.position)
        .map((x) => ({ position: x.position, title: x.title, technique: x.technique, suggestedMinutes: x.suggestedMinutes, done: x.doneAt !== null })),
    };
  }

  async saveTranscript(talkId: string, turns: TranscriptTurn[]) {
    this.transcripts.set(talkId, turns.map((t) => ({ ...t })));
  }

  async closeOpenTalks(endedAt: Date, endReason: string) {
    let closed = 0;
    for (const talk of this.talks.values()) {
      if (talk.endedAt === null) {
        talk.endedAt = endedAt;
        talk.endReason = endReason;
        closed += 1;
      }
    }
    return closed;
  }

  async listPendingTranscripts(userId: string): Promise<PendingTranscript[]> {
    return [...this.talks.values()]
      .filter((t) => t.userId === userId && t.endedAt !== null && this.transcripts.has(t.id))
      .map((t) => ({ talkId: t.id, type: t.type, startedAt: t.startedAt, turns: this.transcripts.get(t.id)!.map((x) => ({ ...x })) }));
  }

  async saveSummary(input: { userId: string; talkId: string; summary: string }) {
    const existing = this.memory.find((m) => m.talkId === input.talkId);
    if (existing) existing.summary = input.summary;
    else this.memory.push({ userId: input.userId, talkId: input.talkId, createdAt: new Date(), summary: input.summary });
    this.transcripts.delete(input.talkId);
  }

  async clearTranscript(talkId: string) {
    this.transcripts.delete(talkId);
  }

  async recentSummaries(userId: string, limit: number): Promise<MemoryEntry[]> {
    return this.memory
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(({ talkId, createdAt, summary }) => ({ talkId, createdAt, summary }));
  }
}
