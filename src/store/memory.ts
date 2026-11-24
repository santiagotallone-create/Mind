import { randomUUID } from "node:crypto";
import type { TalkType } from "../contract/index.js";
import type { DataStore, DeviceRecord, QuotaPeriod, TalkRecord, UsageByType, UserRecord } from "./types.js";

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

  async createUserWithDevice(input: { secretHash: string; deviceName?: string }) {
    const userId = randomUUID();
    const deviceId = randomUUID();
    this.users.set(userId, { id: userId, timezone: "Europe/Rome", locale: "es" });
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
}
