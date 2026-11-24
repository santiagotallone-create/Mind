import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ClientControlMessageSchema,
  CoachToolsSchema,
  QuotaStatusSchema,
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
