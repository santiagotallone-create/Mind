import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TalkType } from "../contract/index.js";
import type { DataStore, DeviceRecord, QuotaPeriod, TalkRecord, UsageByType, UserRecord } from "./types.js";

/**
 * Almacén real: Supabase (Postgres) con la clave de servicio, solo desde el servidor.
 * Lo atómico (registro, apertura de periodo, descuento) vive en funciones SQL de supabase/migrations/0002_bolson.sql.
 */
export class SupabaseStore implements DataStore {
  constructor(private readonly db: SupabaseClient) {}

  static create(url: string, serviceKey: string): SupabaseStore {
    return new SupabaseStore(createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  }

  async createUserWithDevice(input: { secretHash: string; deviceName?: string }) {
    const { data, error } = await this.db.rpc("register_device", {
      p_secret_hash: input.secretHash,
      p_device_name: input.deviceName ?? null,
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
