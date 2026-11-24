import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ClientControlMessageSchema,
  CoachToolsSchema,
  CompleteSessionResponseSchema,
  PlanSummarySchema,
  QuotaStatusSchema,
  SessionAudioResponseSchema,
  SessionSummarySchema,
  TimezoneSchema,
  RegisterDeviceRequestSchema,
  ServerEventSchema,
  UpdateProfileRequestSchema,
  UpdateSettingsRequestSchema,
  VoiceTicketRequestSchema,
} from "./index.js";

const uuid = "3f2b8f0e-6f58-4c4e-9a43-0d9c7a6d1b11";

test("el registro exige código de invitación y secreto largo", () => {
  assert.equal(RegisterDeviceRequestSchema.safeParse({ inviteCode: "", deviceSecret: "x".repeat(43) }).success, false);
  assert.equal(RegisterDeviceRequestSchema.safeParse({ inviteCode: "abc", deviceSecret: "corto" }).success, false);
  assert.equal(RegisterDeviceRequestSchema.safeParse({ inviteCode: "abc", deviceSecret: "x".repeat(43) }).success, true);
});

test("el bolsón sin iniciar no tiene fecha de renovación", () => {
  const ok = QuotaStatusSchema.safeParse({
    state: "sin_iniciar",
    secondsTotal: 7200,
    secondsRemaining: 7200,
    minutesRemaining: 120,
    periodStartsAt: null,
    renewsOn: null,
  });
  assert.equal(ok.success, true);
});

test("la fecha de renovación debe ser explícita AAAA-MM-DD", () => {
  const base = {
    state: "disponible",
    secondsTotal: 7200,
    secondsRemaining: 3000,
    minutesRemaining: 50,
    periodStartsAt: "2026-11-23T10:00:00+01:00",
  };
  assert.equal(QuotaStatusSchema.safeParse({ ...base, renewsOn: "2026-12-23" }).success, true);
  assert.equal(QuotaStatusSchema.safeParse({ ...base, renewsOn: "el mes próximo" }).success, false);
});

test("el ticket de voz valida los tipos que necesitan plan o sesión", () => {
  assert.equal(VoiceTicketRequestSchema.safeParse({ talkType: "libre" }).success, true);
  assert.equal(VoiceTicketRequestSchema.safeParse({ talkType: "plan" }).success, false);
  assert.equal(VoiceTicketRequestSchema.safeParse({ talkType: "plan", planId: uuid }).success, true);
  assert.equal(VoiceTicketRequestSchema.safeParse({ talkType: "cierre" }).success, false);
  assert.equal(VoiceTicketRequestSchema.safeParse({ talkType: "cierre", sessionId: uuid }).success, true);
});

test("mensajes de control y eventos del servidor", () => {
  assert.equal(ClientControlMessageSchema.safeParse({ type: "pause" }).success, true);
  assert.equal(ClientControlMessageSchema.safeParse({ type: "otra-cosa" }).success, false);
  assert.equal(ServerEventSchema.safeParse({ type: "ended", reason: "cuota_agotada" }).success, true);
  assert.equal(ServerEventSchema.safeParse({ type: "ended", reason: "desconocida" }).success, false);
  assert.equal(ServerEventSchema.safeParse({ type: "professional_help" }).success, true);
});

test("herramientas del coach: velocidad limitada y plan con sesiones", () => {
  assert.equal(CoachToolsSchema.safeParse({ name: "ajustar_velocidad", arguments: { velocidad: 0.8 } }).success, true);
  assert.equal(CoachToolsSchema.safeParse({ name: "ajustar_velocidad", arguments: { velocidad: 3 } }).success, false);
  assert.equal(
    CoachToolsSchema.safeParse({
      name: "crear_plan",
      arguments: { nombre: "Soltar la tensión", descripcion: "", sesiones: [] },
    }).success,
    false,
  );
  assert.equal(
    CoachToolsSchema.safeParse({
      name: "crear_plan",
      arguments: {
        nombre: "Soltar la tensión",
        descripcion: "Cinco sesiones",
        sesiones: [{ titulo: "Respirar", tecnica: "respiracion", minutos_sugeridos: 10 }],
      },
    }).success,
    true,
  );
});

test("las ediciones de perfil y ajustes exigen al menos un campo y respetan rangos", () => {
  assert.equal(UpdateProfileRequestSchema.safeParse({}).success, false);
  assert.equal(UpdateProfileRequestSchema.safeParse({ experience: "algo_practica" }).success, true);
  assert.equal(UpdateProfileRequestSchema.safeParse({ experience: "experto" }).success, false);
  assert.equal(UpdateSettingsRequestSchema.safeParse({ voiceSpeed: 2 }).success, false);
  assert.equal(UpdateSettingsRequestSchema.safeParse({ voiceSpeed: 0.9 }).success, true);
});

test("el cierre por tope de 30 minutos tiene su propio motivo", () => {
  assert.equal(ServerEventSchema.safeParse({ type: "ended", reason: "limite_duracion" }).success, true);
  assert.equal(ServerEventSchema.safeParse({ type: "ended", reason: "otro_motivo" }).success, false);
});

test("el registro acepta zona horaria IANA e idioma, ambos opcionales", () => {
  const base = { inviteCode: "abc", deviceSecret: "x".repeat(43) };
  assert.equal(RegisterDeviceRequestSchema.safeParse({ ...base, timezone: "Europe/Rome", locale: "es" }).success, true);
  assert.equal(RegisterDeviceRequestSchema.safeParse({ ...base, timezone: "America/Argentina/Buenos_Aires" }).success, true);
  assert.equal(RegisterDeviceRequestSchema.safeParse({ ...base, locale: "fr" }).success, false);
  for (const bad of ["Marte/Olimpo", "Europe", "", "Europe/Rome; drop table users"]) {
    assert.equal(TimezoneSchema.safeParse(bad).success, false, bad);
  }
  assert.equal(TimezoneSchema.safeParse("UTC").success, true);
});

const session = {
  id: uuid,
  planId: uuid,
  planName: "Soltar la tensión",
  position: 1,
  title: "Respirar",
  technique: "respiracion",
  suggestedMinutes: 10,
  done: false,
  doneAt: null,
  favorite: false,
  availableMinutes: [10],
  audioVersion: "abc123",
};
const plan = {
  id: uuid,
  name: "Soltar la tensión",
  description: "Cinco sesiones",
  status: "activo",
  sessionsTotal: 5,
  sessionsDone: 0,
  nextSession: { id: uuid, position: 1, title: "Respirar", suggestedMinutes: 10 },
  createdAt: "2026-11-24T10:00:00Z",
  completedAt: null,
};

test("sesión y plan traen nombre del plan, próxima sesión y versión del audio", () => {
  assert.equal(SessionSummarySchema.safeParse(session).success, true);
  assert.equal(SessionSummarySchema.safeParse({ ...session, audioVersion: null }).success, true);
  assert.equal(SessionSummarySchema.safeParse({ ...session, planName: undefined }).success, false);
  assert.equal(PlanSummarySchema.safeParse(plan).success, true);
  assert.equal(PlanSummarySchema.safeParse({ ...plan, status: "completado", nextSession: null }).success, true);
  assert.equal(PlanSummarySchema.safeParse({ ...plan, nextSession: undefined }).success, false);
});

test("completar una sesión devuelve la sesión y el plan; el audio trae su versión", () => {
  assert.equal(CompleteSessionResponseSchema.safeParse({ session, plan }).success, true);
  assert.equal(CompleteSessionResponseSchema.safeParse({ session }).success, false);
  const audio = { status: "lista", minutes: 10, url: "https://example.com/a.m4a", expiresAt: "2026-11-24T11:00:00Z", format: "m4a", bytes: 1000, durationSeconds: 600, version: "abc123" };
  assert.equal(SessionAudioResponseSchema.safeParse(audio).success, true);
  assert.equal(SessionAudioResponseSchema.safeParse({ ...audio, version: undefined }).success, false);
});

test("el evento error solo admite los códigos documentados", () => {
  for (const code of ["invalid_ticket", "origin_not_allowed", "rate_limited", "start_failed", "talk_not_found", "invalid_message", "provider_error"]) {
    assert.equal(ServerEventSchema.safeParse({ type: "error", code, retryable: false }).success, true, code);
  }
  assert.equal(ServerEventSchema.safeParse({ type: "error", code: "otro", retryable: false }).success, false);
});

test("plan_created trae nombre y sesiones; interview_completed lista los planes", () => {
  assert.equal(ServerEventSchema.safeParse({ type: "plan_created", planId: uuid, name: "Soltar la tensión", sessionsTotal: 5 }).success, true);
  assert.equal(ServerEventSchema.safeParse({ type: "plan_created", planId: uuid }).success, false);
  assert.equal(ServerEventSchema.safeParse({ type: "interview_completed", planIds: [uuid, uuid] }).success, true);
  assert.equal(ServerEventSchema.safeParse({ type: "interview_completed" }).success, false);
});
