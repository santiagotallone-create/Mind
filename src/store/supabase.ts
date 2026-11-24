import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Language, TalkType } from "../contract/index.js";
import type {
  DataStore,
  DeviceRecord,
  Experience,
  MemoryEntry,
  PendingTranscript,
  AudioRow,
  PlanContext,
  PlanRow,
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

/**
 * Almacén real: Supabase (Postgres) con la clave de servicio, solo desde el servidor.
 * Lo atómico (registro, apertura de periodo, descuento) vive en funciones SQL de supabase/migrations/0002_bolson.sql.
 */
export class SupabaseStore implements DataStore {
  constructor(private readonly db: SupabaseClient) {}

  static create(url: string, serviceKey: string): SupabaseStore {
    return new SupabaseStore(createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  }

  async createUserWithDevice(input: { secretHash: string; deviceName?: string; timezone?: string; locale?: Language }) {
    const { data, error } = await this.db.rpc("register_device", {
      p_secret_hash: input.secretHash,
      p_device_name: input.deviceName ?? null,
      p_timezone: input.timezone ?? null,
      p_locale: input.locale ?? null,
    });
    const row = first<{ new_user_id: string; new_device_id: string }>(data, error, "register_device");
    return { userId: row.new_user_id, deviceId: row.new_device_id };
  }

  async getDevice(deviceId: string): Promise<DeviceRecord | null> {
    const { data, error } = await this.db
      .from("devices")
      .select("id, user_id, secret_hash, revoked_at")
      .eq("id", deviceId)
      .maybeSingle();
    if (error) throw dbError("devices", error);
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      secretHash: data.secret_hash,
      revokedAt: data.revoked_at ? new Date(data.revoked_at) : null,
    };
  }

  async touchDevice(deviceId: string, at: Date): Promise<void> {
    const { error } = await this.db.from("devices").update({ last_seen_at: at.toISOString() }).eq("id", deviceId);
    if (error) throw dbError("devices", error);
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const { data, error } = await this.db.from("users").select("id, timezone, locale").eq("id", userId).maybeSingle();
    if (error) throw dbError("users", error);
    return data ? { id: data.id, timezone: data.timezone, locale: data.locale } : null;
  }

  async listPlans(userId: string): Promise<PlanRow[]> {
    const { data, error } = await this.db.from("plans").select("*").eq("user_id", userId);
    if (error) throw dbError("plans", error);
    return (data ?? []).map(toPlanRow);
  }

  async getPlan(userId: string, planId: string): Promise<PlanRow | null> {
    const { data, error } = await this.db.from("plans").select("*").eq("user_id", userId).eq("id", planId).maybeSingle();
    if (error) throw dbError("plans", error);
    return data ? toPlanRow(data) : null;
  }

  async listSessions(userId: string, filter: { planId?: string; sessionId?: string; favoriteOnly?: boolean } = {}): Promise<SessionRow[]> {
    let query = this.db
      .from("sessions")
      .select(
        "id, plan_id, position, title, technique, suggested_minutes, done_at, favorite, plans!inner(name, status, created_at), session_audios(minutes, status, storage_path, bytes, duration_seconds, script_hash)",
      )
      .eq("user_id", userId);
    if (filter.planId) query = query.eq("plan_id", filter.planId);
    if (filter.sessionId) query = query.eq("id", filter.sessionId);
    if (filter.favoriteOnly) query = query.eq("favorite", true);
    const { data, error } = await query;
    if (error) throw dbError("sessions", error);
    return (data ?? [])
      .map((row: any) => ({
        id: row.id,
        planId: row.plan_id,
        planName: row.plans.name,
        planStatus: row.plans.status,
        planCreatedAt: new Date(row.plans.created_at),
        position: row.position,
        title: row.title,
        technique: row.technique,
        suggestedMinutes: row.suggested_minutes,
        doneAt: row.done_at ? new Date(row.done_at) : null,
        favorite: row.favorite,
        audios: (row.session_audios ?? []).map(toAudio),
      }))
      .sort((a, b) => a.planCreatedAt.getTime() - b.planCreatedAt.getTime() || a.position - b.position);
  }

  async setFavorite(userId: string, sessionId: string, favorite: boolean): Promise<boolean> {
    const { data, error } = await this.db.from("sessions").update({ favorite }).eq("id", sessionId).eq("user_id", userId).select("id");
    if (error) throw dbError("sessions", error);
    return (data ?? []).length > 0;
  }

  async completeSession(userId: string, sessionId: string, at: Date): Promise<boolean> {
    const { data, error } = await this.db.rpc("complete_session", { p_user: userId, p_session: sessionId, p_at: at.toISOString() });
    if (error) throw dbError("complete_session", error);
    return data === true;
  }

  async getAudio(userId: string, sessionId: string, minutes: number): Promise<AudioRow | null> {
    const { data, error } = await this.db
      .from("session_audios")
      .select("minutes, status, storage_path, bytes, duration_seconds, script_hash")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("minutes", minutes)
      .maybeSingle();
    if (error) throw dbError("session_audios", error);
    return data ? toAudio(data) : null;
  }

  async signAudioUrl(storagePath: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.db.storage.from("meditaciones").createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data) throw new Error(`Supabase (storage): no se pudo firmar la URL: ${error?.message ?? "sin respuesta"}`);
    return data.signedUrl;
  }

  async getOpenPeriod(userId: string, now: Date): Promise<QuotaPeriod | null> {
    const iso = now.toISOString();
    const { data, error } = await this.db
      .from("quota_periods")
      .select("*")
      .eq("user_id", userId)
      .lte("starts_at", iso)
      .gt("ends_at", iso)
      .order("starts_at", { ascending: false })
      .limit(1);
    if (error) throw dbError("quota_periods", error);
    return data && data.length > 0 ? toPeriod(data[0]) : null;
  }

  async openPeriod(input: { userId: string; now: Date; endsAt: Date; secondsTotal: number }): Promise<QuotaPeriod> {
    const { data, error } = await this.db.rpc("open_quota_period", {
      p_user: input.userId,
      p_now: input.now.toISOString(),
      p_ends_at: input.endsAt.toISOString(),
      p_seconds_total: input.secondsTotal,
    });
    return toPeriod(first(data, error, "open_quota_period"));
  }

  async chargeTalk(input: { talkId: string; periodId: string; activeSeconds: number }): Promise<QuotaPeriod> {
    const { data, error } = await this.db.rpc("charge_talk", {
      p_talk: input.talkId,
      p_period: input.periodId,
      p_active_seconds: input.activeSeconds,
    });
    return toPeriod(first(data, error, "charge_talk"));
  }

  async createTalk(input: { userId: string; type: TalkType; planId?: string; sessionId?: string; startedAt?: Date }) {
    const { data, error } = await this.db
      .from("talks")
      .insert({
        user_id: input.userId,
        type: input.type,
        plan_id: input.planId ?? null,
        session_id: input.sessionId ?? null,
        ...(input.startedAt ? { started_at: input.startedAt.toISOString() } : {}),
      })
      .select("*")
      .single();
    if (error) throw dbError("talks", error);
    return toTalk(data);
  }

  async getTalk(userId: string, talkId: string): Promise<TalkRecord | null> {
    const { data, error } = await this.db.from("talks").select("*").eq("id", talkId).eq("user_id", userId).maybeSingle();
    if (error) throw dbError("talks", error);
    return data ? toTalk(data) : null;
  }

  async closeTalk(talkId: string, input: { endedAt: Date; endReason: string; metrics?: Record<string, unknown> }): Promise<void> {
    const { error } = await this.db
      .from("talks")
      .update({
        ended_at: input.endedAt.toISOString(),
        end_reason: input.endReason,
        ...(input.metrics ? { metrics: input.metrics } : {}),
      })
      .eq("id", talkId);
    if (error) throw dbError("talks", error);
  }

  async usageByType(userId: string, periodId: string): Promise<UsageByType[]> {
    const { data, error } = await this.db
      .from("talks")
      .select("type, active_seconds")
      .eq("user_id", userId)
      .eq("quota_period_id", periodId);
    if (error) throw dbError("talks", error);
    const byType = new Map<TalkType, UsageByType>();
    for (const row of data ?? []) {
      const entry = byType.get(row.type) ?? { type: row.type as TalkType, talks: 0, activeSeconds: 0 };
      entry.talks += 1;
      entry.activeSeconds += row.active_seconds;
      byType.set(row.type, entry);
    }
    return [...byType.values()];
  }

  // --- Coach: perfil, ajustes, progreso y memoria interna ---

  async getProfile(userId: string): Promise<ProfileRecord> {
    const { data, error } = await this.db
      .from("profiles")
      .select("goals, experience, current_state, interview_completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw dbError("profiles", error);
    return {
      goals: data?.goals ?? "",
      experience: data?.experience ?? null,
      currentState: data?.current_state ?? "",
      interviewCompletedAt: data?.interview_completed_at ? new Date(data.interview_completed_at) : null,
    };
  }

  async updateProfile(userId: string, patch: { goals?: string; experience?: Experience; currentState?: string }): Promise<void> {
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    if (patch.goals !== undefined) row.goals = patch.goals;
    if (patch.experience !== undefined) row.experience = patch.experience;
    if (patch.currentState !== undefined) row.current_state = patch.currentState;
    const { error } = await this.db.from("profiles").upsert(row, { onConflict: "user_id" });
    if (error) throw dbError("profiles", error);
  }

  async markInterviewComplete(userId: string, at: Date): Promise<void> {
    const { error } = await this.db
      .from("profiles")
      .upsert({ user_id: userId, interview_completed_at: at.toISOString(), updated_at: at.toISOString() }, { onConflict: "user_id" });
    if (error) throw dbError("profiles", error);
  }

  async getSettings(userId: string): Promise<SettingsRecord> {
    const { data, error } = await this.db.from("settings").select("locale, timezone, voice_speed").eq("user_id", userId).maybeSingle();
    if (error) throw dbError("settings", error);
    return { locale: data?.locale ?? "es", timezone: data?.timezone ?? "Europe/Rome", voiceSpeed: Number(data?.voice_speed ?? 1) };
  }

  async updateVoiceSpeed(userId: string, speed: number): Promise<void> {
    const { error } = await this.db.from("settings").upsert({ user_id: userId, voice_speed: speed }, { onConflict: "user_id" });
    if (error) throw dbError("settings", error);
  }

  async getProgress(userId: string): Promise<ProgressSnapshot> {
    const [plans, sessions] = await Promise.all([
      this.db.from("plans").select("id, name, status").eq("user_id", userId),
      this.db.from("sessions").select("plan_id, done_at").eq("user_id", userId),
    ]);
    if (plans.error) throw dbError("plans", plans.error);
    if (sessions.error) throw dbError("sessions", sessions.error);
    const allSessions = sessions.data ?? [];
    const done = allSessions.filter((x) => x.done_at);
    return {
      activePlans: (plans.data ?? [])
        .filter((p) => p.status === "activo")
        .map((p) => {
          const own = allSessions.filter((x) => x.plan_id === p.id);
          return { id: p.id, name: p.name, sessionsDone: own.filter((x) => x.done_at).length, sessionsTotal: own.length };
        }),
      completedPlans: (plans.data ?? []).filter((p) => p.status === "completado").length,
      sessionsDoneTotal: done.length,
      lastSessionDoneAt: done.reduce<Date | null>((latest, x) => {
        const at = new Date(x.done_at);
        return !latest || at > latest ? at : latest;
      }, null),
    };
  }

  async getSessionContext(userId: string, sessionId: string): Promise<SessionContext | null> {
    const { data, error } = await this.db
      .from("sessions")
      .select("id, plan_id, title, technique, suggested_minutes, done_at, plans(name)")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw dbError("sessions", error);
    if (!data) return null;
    const plan = Array.isArray(data.plans) ? data.plans[0] : data.plans;
    return {
      id: data.id,
      planId: data.plan_id,
      planName: plan?.name ?? "",
      title: data.title,
      technique: data.technique,
      suggestedMinutes: data.suggested_minutes,
      doneAt: data.done_at ? new Date(data.done_at) : null,
    };
  }

  async getPlanContext(userId: string, planId: string): Promise<PlanContext | null> {
    const [plan, sessions] = await Promise.all([
      this.db.from("plans").select("id, name, description, status").eq("id", planId).eq("user_id", userId).maybeSingle(),
      this.db
        .from("sessions")
        .select("position, title, technique, suggested_minutes, done_at")
        .eq("plan_id", planId)
        .eq("user_id", userId)
        .order("position", { ascending: true }),
    ]);
    if (plan.error) throw dbError("plans", plan.error);
    if (sessions.error) throw dbError("sessions", sessions.error);
    if (!plan.data) return null;
    return {
      id: plan.data.id,
      name: plan.data.name,
      description: plan.data.description,
      status: plan.data.status,
      sessions: (sessions.data ?? []).map((x) => ({
        position: x.position,
        title: x.title,
        technique: x.technique,
        suggestedMinutes: x.suggested_minutes,
        done: x.done_at !== null,
      })),
    };
  }

  async saveTranscript(talkId: string, turns: TranscriptTurn[]): Promise<void> {
    const { error } = await this.db.from("talks").update({ transcript: turns }).eq("id", talkId);
    if (error) throw dbError("talks", error);
  }

  async closeOpenTalks(endedAt: Date, endReason: string): Promise<number> {
    const { data, error } = await this.db
      .from("talks")
      .update({ ended_at: endedAt.toISOString(), end_reason: endReason })
      .is("ended_at", null)
      .select("id");
    if (error) throw dbError("talks", error);
    return data?.length ?? 0;
  }

  async listPendingTranscripts(userId: string): Promise<PendingTranscript[]> {
    const { data, error } = await this.db
      .from("talks")
      .select("id, type, started_at, transcript")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .not("transcript", "is", null)
      .order("started_at", { ascending: true });
    if (error) throw dbError("talks", error);
    return (data ?? []).map((row) => ({
      talkId: row.id,
      type: row.type,
      startedAt: new Date(row.started_at),
      turns: Array.isArray(row.transcript) ? row.transcript : [],
    }));
  }

  async saveSummary(input: { userId: string; talkId: string; summary: string }): Promise<void> {
    const saved = await this.db
      .from("coach_memory")
      .upsert({ user_id: input.userId, talk_id: input.talkId, summary: input.summary }, { onConflict: "talk_id" });
    if (saved.error) throw dbError("coach_memory", saved.error);
    await this.clearTranscript(input.talkId);
  }

  async clearTranscript(talkId: string): Promise<void> {
    const { error } = await this.db.from("talks").update({ transcript: null }).eq("id", talkId);
    if (error) throw dbError("talks", error);
  }

  async recentSummaries(userId: string, limit: number): Promise<MemoryEntry[]> {
    const { data, error } = await this.db
      .from("coach_memory")
      .select("talk_id, created_at, summary")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw dbError("coach_memory", error);
    return (data ?? []).map((row) => ({ talkId: row.talk_id, createdAt: new Date(row.created_at), summary: row.summary }));
  }
}

/** Un mensaje claro sin datos del usuario ni claves. */
function dbError(what: string, error: { message: string }): Error {
  return new Error(`Supabase (${what}): ${error.message}`);
}

/** Las funciones SQL devuelven un objeto o una lista de un elemento, según el tipo de retorno. */
function first<T>(data: unknown, error: { message: string } | null, what: string): T {
  if (error) throw dbError(what, error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`Supabase (${what}): respuesta vacía`);
  return row as T;
}

function toPlanRow(row: any): PlanRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

function toAudio(row: any): AudioRow {
  return {
    minutes: row.minutes,
    status: row.status,
    storagePath: row.storage_path,
    bytes: row.bytes === null ? null : Number(row.bytes),
    durationSeconds: row.duration_seconds,
    scriptHash: row.script_hash,
  };
}

function toPeriod(row: any): QuotaPeriod {
  return {
    id: row.id,
    userId: row.user_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    secondsTotal: row.seconds_total,
    secondsUsed: row.seconds_used,
  };
}

function toTalk(row: any): TalkRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    planId: row.plan_id,
    sessionId: row.session_id,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    activeSeconds: row.active_seconds,
    endReason: row.end_reason,
    quotaPeriodId: row.quota_period_id,
    metrics: row.metrics ?? {},
  };
}
