import type { TalkType } from "../contract/index.js";

/** Contratos de acceso a datos. El servidor solo conoce estas interfaces: hay una versión en memoria (pruebas y desarrollo) y una con Supabase. */

export interface UserRecord {
  id: string;
  timezone: string;
  locale: "es" | "it";
}

export interface DeviceRecord {
  id: string;
  userId: string;
  secretHash: string;
  revokedAt: Date | null;
}

export interface UsersStore {
  /** Crea un usuario nuevo con su dispositivo, su perfil vacío y sus ajustes por defecto. */
  createUserWithDevice(input: { secretHash: string; deviceName?: string }): Promise<{ userId: string; deviceId: string }>;
  getDevice(deviceId: string): Promise<DeviceRecord | null>;
  touchDevice(deviceId: string, at: Date): Promise<void>;
  getUser(userId: string): Promise<UserRecord | null>;
}

export interface QuotaPeriod {
  id: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  secondsTotal: number;
  secondsUsed: number;
}

export interface QuotaStore {
  /** Periodo con startsAt <= now < endsAt, o null si no hay ninguno abierto. */
  getOpenPeriod(userId: string, now: Date): Promise<QuotaPeriod | null>;
  /**
   * Devuelve el periodo abierto o, si no hay, crea uno nuevo. Es atómico por usuario:
   * dos activaciones simultáneas nunca producen dos periodos abiertos.
   */
  openPeriod(input: { userId: string; now: Date; endsAt: Date; secondsTotal: number }): Promise<QuotaPeriod>;
  /**
   * Registra el tiempo activo total de una charla y descuenta del periodo solo lo nuevo.
   * Es idempotente y monótono: repetir la llamada, o mandar un total menor, no descuenta de más.
   * El saldo del periodo nunca pasa de `secondsTotal`; la charla guarda el tiempo real.
   */
  chargeTalk(input: { talkId: string; periodId: string; activeSeconds: number }): Promise<QuotaPeriod>;
}

export interface TalkRecord {
  id: string;
  userId: string;
  type: TalkType;
  planId: string | null;
  sessionId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  activeSeconds: number;
  endReason: string | null;
  quotaPeriodId: string | null;
  metrics: Record<string, unknown>;
}

export interface UsageByType {
  type: TalkType;
  talks: number;
  activeSeconds: number;
}

export interface TalksStore {
  createTalk(input: { userId: string; type: TalkType; planId?: string; sessionId?: string; startedAt?: Date }): Promise<TalkRecord>;
  getTalk(userId: string, talkId: string): Promise<TalkRecord | null>;
  closeTalk(talkId: string, input: { endedAt: Date; endReason: string; metrics?: Record<string, unknown> }): Promise<void>;
  /** Consumo del periodo agrupado por tipo de charla (para revisar el riesgo de consumo). */
  usageByType(userId: string, periodId: string): Promise<UsageByType[]>;
}

export interface DataStore extends UsersStore, QuotaStore, TalksStore {}
