import type { Language, TalkType } from "../contract/index.js";

export type Experience = "principiante" | "algo_practica" | "mucha_practica";

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
  createUserWithDevice(input: {
    secretHash: string;
    deviceName?: string;
    /** Zona IANA y idioma que envía la app al registrarse. Si faltan: Europe/Rome y es. */
    timezone?: string;
    locale?: Language;
  }): Promise<{ userId: string; deviceId: string }>;
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

export interface ProfileRecord {
  goals: string;
  experience: Experience | null;
  currentState: string;
  interviewCompletedAt: Date | null;
}

export interface SettingsRecord {
  locale: "es" | "it";
  timezone: string;
  voiceSpeed: number;
}

/** Un turno de la charla. Se guarda solo hasta generar el resumen y después se borra. */
export interface TranscriptTurn {
  role: "user" | "coach";
  text: string;
  at: string;
}

export interface PlanProgress {
  id: string;
  name: string;
  sessionsDone: number;
  sessionsTotal: number;
}

export interface ProgressSnapshot {
  activePlans: PlanProgress[];
  completedPlans: number;
  sessionsDoneTotal: number;
  lastSessionDoneAt: Date | null;
}

export interface SessionContext {
  id: string;
  planId: string;
  planName: string;
  title: string;
  technique: string;
  suggestedMinutes: number;
  doneAt: Date | null;
}

export interface PlanContext {
  id: string;
  name: string;
  description: string;
  status: string;
  sessions: { position: number; title: string; technique: string; suggestedMinutes: number; done: boolean }[];
}

export interface MemoryEntry {
  talkId: string | null;
  createdAt: Date;
  summary: string;
}

export interface PendingTranscript {
  talkId: string;
  type: TalkType;
  startedAt: Date;
  turns: TranscriptTurn[];
}

/** Lo que el coach necesita saber y recordar: perfil, ajustes, progreso, memoria interna. */
export interface CoachStore {
  getProfile(userId: string): Promise<ProfileRecord>;
  updateProfile(userId: string, patch: { goals?: string; experience?: Experience; currentState?: string }): Promise<void>;
  markInterviewComplete(userId: string, at: Date): Promise<void>;
  getSettings(userId: string): Promise<SettingsRecord>;
  updateVoiceSpeed(userId: string, speed: number): Promise<void>;
  getProgress(userId: string): Promise<ProgressSnapshot>;
  getSessionContext(userId: string, sessionId: string): Promise<SessionContext | null>;
  getPlanContext(userId: string, planId: string): Promise<PlanContext | null>;
  /** Guarda la transcripción provisoria de una charla (se borra al generar el resumen). */
  saveTranscript(talkId: string, turns: TranscriptTurn[]): Promise<void>;
  /** Cierra las charlas que quedaron abiertas (por ejemplo tras un reinicio del servidor). Devuelve cuántas. */
  closeOpenTalks(endedAt: Date, endReason: string): Promise<number>;
  /** Charlas ya cerradas cuya transcripción todavía no se resumió. */
  listPendingTranscripts(userId: string): Promise<PendingTranscript[]>;
  /** Guarda el resumen interno y borra la transcripción de esa charla. Repetirla no duplica el resumen. */
  saveSummary(input: { userId: string; talkId: string; summary: string }): Promise<void>;
  /** Borra la transcripción sin generar resumen (charla vacía). */
  clearTranscript(talkId: string): Promise<void>;
  /** Resúmenes más recientes primero. Solo los lee el servidor: nunca salen por la API. */
  recentSummaries(userId: string, limit: number): Promise<MemoryEntry[]>;
}

export type PlanStatus = "activo" | "completado" | "archivado";
export type AudioStatus = "pendiente" | "generando" | "lista" | "error";

export interface PlanRow {
  id: string;
  name: string;
  description: string;
  status: PlanStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AudioRow {
  minutes: number;
  status: AudioStatus;
  /** Ruta del archivo en el almacenamiento privado. Nunca sale por la API: se entrega una URL firmada. */
  storagePath: string | null;
  bytes: number | null;
  durationSeconds: number | null;
  /** Identifica el guion con el que se hizo el audio. */
  scriptHash: string | null;
}

export interface SessionRow {
  id: string;
  planId: string;
  planName: string;
  planStatus: PlanStatus;
  planCreatedAt: Date;
  position: number;
  title: string;
  technique: string;
  suggestedMinutes: number;
  doneAt: Date | null;
  favorite: boolean;
  audios: AudioRow[];
}

/** Planes, sesiones y audios que ve la app. Los crea el coach (Olas 2 y 3); aquí solo se leen y se marcan. */
export interface PlansStore {
  listPlans(userId: string): Promise<PlanRow[]>;
  getPlan(userId: string, planId: string): Promise<PlanRow | null>;
  /** Sesiones con su plan y sus audios, ordenadas por creación del plan y posición. */
  listSessions(userId: string, filter?: { planId?: string; sessionId?: string; favoriteOnly?: boolean }): Promise<SessionRow[]>;
  /** false si la sesión no existe o no es de esa persona. */
  setFavorite(userId: string, sessionId: string, favorite: boolean): Promise<boolean>;
  /**
   * Marca la sesión como hecha y, si era la última, el plan como completado. Atómico e idempotente: repetirlo no cambia la fecha.
   * false si la sesión no existe o no es de esa persona.
   */
  completeSession(userId: string, sessionId: string, at: Date): Promise<boolean>;
  getAudio(userId: string, sessionId: string, minutes: number): Promise<AudioRow | null>;
  /** URL firmada de descarga de un audio del almacenamiento privado. */
  signAudioUrl(storagePath: string, expiresInSeconds: number): Promise<string>;
}

export interface DataStore extends UsersStore, QuotaStore, TalksStore, CoachStore, PlansStore {}
