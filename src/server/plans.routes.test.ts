import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { CompleteSessionResponseSchema, PlanDetailResponseSchema, PlanListResponseSchema, SessionAudioResponseSchema } from "../contract/index.js";
import { MemoryStore } from "../store/memory.js";
import { bearer, FakeClock, registerDevice, testEnv } from "../testing/helpers.js";
import { buildApp } from "./app.js";

const apps: Array<{ close(): Promise<unknown> }> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function setup() {
  const clock = new FakeClock(new Date("2026-11-24T10:00:00+01:00"));
  const store = new MemoryStore();
  const app = buildApp({ env: testEnv({ accessTokenSeconds: 86_400 }), store, clock: clock.now });
  apps.push(app);
  await app.ready();
  const device = await registerDevice(app);
  const other = await registerDevice(app);
  const call = (method: "GET" | "PUT" | "POST", url: string, payload?: object, token = device.accessToken) =>
    app.inject({ method, url, headers: bearer(token), payload });

  // Un plan activo de tres sesiones (la primera hecha) y uno completado.
  const planId = store.addPlan(device.userId, { name: "Soltar la tensión", description: "Tres semanas de respiración" });
  const s1 = store.addSession(device.userId, planId, { title: "Respirar", doneAt: new Date("2026-11-20T08:00:00Z") });
  const s2 = store.addSession(device.userId, planId, { title: "Escaneo corporal", technique: "escaneo_corporal", suggestedMinutes: 15 });
  const s3 = store.addSession(device.userId, planId, { title: "Atención plena", technique: "atencion_plena", suggestedMinutes: 5 });
  store.addAudio(device.userId, s2, { minutes: 15, scriptHash: "v2" });
  store.addAudio(device.userId, s2, { minutes: 5, scriptHash: "v1" });
  store.addAudio(device.userId, s3, { minutes: 5, status: "generando", storagePath: null, scriptHash: null });
  const doneId = store.addPlan(device.userId, { name: "Primer plan", status: "completado" });
  store.addSession(device.userId, doneId, { title: "Única", doneAt: new Date("2026-11-01T08:00:00Z") });
  return { app, store, clock, device, other, call, planId, doneId, s1, s2, s3 };
}

describe("autenticación", () => {
  test("todas las rutas piden token de acceso", async () => {
    const { app, planId, s1 } = await setup();
    for (const [method, url] of [
      ["GET", "/v1/plans"],
      ["GET", `/v1/plans/${planId}`],
      ["GET", "/v1/favorites"],
      ["PUT", `/v1/sessions/${s1}/favorite`],
      ["POST", `/v1/sessions/${s1}/complete`],
      ["GET", `/v1/sessions/${s1}/audio?minutes=5`],
      ["POST", `/v1/sessions/${s1}/audio`],
    ] as const) {
      assert.equal((await app.inject({ method, url })).statusCode, 401, `${method} ${url}`);
    }
  });
});

describe("GET /v1/plans", () => {
  test("lista los planes con progreso y próxima sesión; activos antes que completados", async () => {
    const { call, s2 } = await setup();
    const res = await call("GET", "/v1/plans");
    assert.equal(res.statusCode, 200);
    const { plans } = PlanListResponseSchema.parse(res.json());
    assert.deepEqual(plans.map((p) => [p.name, p.status, p.sessionsDone, p.sessionsTotal]), [
      ["Soltar la tensión", "activo", 1, 3],
      ["Primer plan", "completado", 1, 1],
    ]);
    assert.deepEqual(plans[0]!.nextSession, { id: s2, position: 2, title: "Escaneo corporal", suggestedMinutes: 15 });
    assert.equal(plans[1]!.nextSession, null, "un plan completado no tiene próxima sesión");
  });

  test("no muestra planes archivados ni los de otra persona", async () => {
    const { store, device, other, call } = await setup();
    store.addPlan(device.userId, { name: "Viejo", status: "archivado" });
    store.addPlan(other.userId, { name: "Ajeno" });
    const names = PlanListResponseSchema.parse((await call("GET", "/v1/plans")).json()).plans.map((p) => p.name);
    assert.deepEqual(names, ["Soltar la tensión", "Primer plan"]);
  });

  test("sin planes responde una lista vacía", async () => {
    const { call, other } = await setup();
    const res = await call("GET", "/v1/plans", undefined, other.accessToken);
    assert.deepEqual(res.json(), { plans: [] });
  });
});

describe("GET /v1/plans/:id", () => {
  test("devuelve el plan y sus sesiones con planName, duraciones listas y versión del audio", async () => {
    const { call, planId, s1, s2, s3 } = await setup();
    const { plan, sessions } = PlanDetailResponseSchema.parse((await call("GET", `/v1/plans/${planId}`)).json());
    assert.equal(plan.sessionsTotal, 3);
    assert.deepEqual(sessions.map((s) => s.id), [s1, s2, s3]);
    assert.ok(sessions.every((s) => s.planName === "Soltar la tensión"));
    assert.deepEqual([sessions[0]!.done, sessions[1]!.done], [true, false]);
    assert.deepEqual(sessions[1]!.availableMinutes, [5, 15], "duraciones con audio listo, ordenadas");
    assert.equal(sessions[1]!.audioVersion, "v2", "la versión es la del audio de la duración sugerida (15)");
    assert.deepEqual(sessions[2]!.availableMinutes, [], "un audio en generación no cuenta como listo");
    assert.equal(sessions[2]!.audioVersion, null);
    assert.equal(sessions[0]!.audioVersion, null);
  });

  test("un plan ajeno, inexistente o con id inválido da 404", async () => {
    const { call, planId, other } = await setup();
    assert.equal((await call("GET", `/v1/plans/${planId}`, undefined, other.accessToken)).statusCode, 404);
    assert.equal((await call("GET", "/v1/plans/00000000-0000-4000-8000-000000000000")).statusCode, 404);
    assert.equal((await call("GET", "/v1/plans/no-es-un-uuid")).statusCode, 404);
  });
});

describe("favoritas", () => {
  test("marcar y desmarcar es idempotente y devuelve la sesión actualizada", async () => {
    const { call, s2 } = await setup();
    for (let i = 0; i < 2; i++) {
      const res = await call("PUT", `/v1/sessions/${s2}/favorite`, { favorite: true });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().favorite, true);
      assert.equal(res.json().id, s2);
    }
    assert.deepEqual((await call("GET", "/v1/favorites")).json().sessions.map((s: any) => s.id), [s2]);
    assert.equal((await call("PUT", `/v1/sessions/${s2}/favorite`, { favorite: false })).json().favorite, false);
    assert.deepEqual((await call("GET", "/v1/favorites")).json(), { sessions: [] });
  });

  test("cuerpo inválido: 400; sesión ajena: 404; el favorito ajeno no aparece", async () => {
    const { call, s2, other } = await setup();
    assert.equal((await call("PUT", `/v1/sessions/${s2}/favorite`, { favorite: "si" } as any)).statusCode, 400);
    assert.equal((await call("PUT", `/v1/sessions/${s2}/favorite`, { favorite: true }, other.accessToken)).statusCode, 404);
    await call("PUT", `/v1/sessions/${s2}/favorite`, { favorite: true });
    assert.deepEqual((await call("GET", "/v1/favorites", undefined, other.accessToken)).json(), { sessions: [] });
  });

  test("las favoritas de un plan archivado no se muestran", async () => {
    const { store, device, call } = await setup();
    const archived = store.addPlan(device.userId, { name: "Viejo", status: "archivado" });
    store.addSession(device.userId, archived, { title: "Vieja", favorite: true });
    assert.deepEqual((await call("GET", "/v1/favorites")).json(), { sessions: [] });
  });
});

describe("POST /v1/sessions/:id/complete", () => {
  test("marca la sesión hecha y devuelve la sesión y el plan con el progreso nuevo", async () => {
    const { call, s2, s3, clock } = await setup();
    const res = await call("POST", `/v1/sessions/${s2}/complete`, {});
    assert.equal(res.statusCode, 200);
    const body = CompleteSessionResponseSchema.parse(res.json());
    assert.equal(body.session.done, true);
    assert.equal(body.session.doneAt, clock.now().toISOString());
    assert.equal(body.plan.sessionsDone, 2);
    assert.equal(body.plan.status, "activo");
    assert.equal(body.plan.nextSession!.id, s3);
  });

  test("al terminar la última sesión el plan pasa a completado y no tiene próxima sesión", async () => {
    const { call, s2, s3 } = await setup();
    await call("POST", `/v1/sessions/${s2}/complete`);
    const body = CompleteSessionResponseSchema.parse((await call("POST", `/v1/sessions/${s3}/complete`)).json());
    assert.equal(body.plan.status, "completado");
    assert.ok(body.plan.completedAt);
    assert.equal(body.plan.nextSession, null);
    assert.equal(body.plan.sessionsDone, 3);
  });

  test("es idempotente: repetirlo no cambia la fecha en que se hizo", async () => {
    const { call, s2, clock } = await setup();
    const first = (await call("POST", `/v1/sessions/${s2}/complete`)).json();
    clock.advanceSeconds(3600);
    const second = (await call("POST", `/v1/sessions/${s2}/complete`)).json();
    assert.equal(second.session.doneAt, first.session.doneAt);
    assert.equal(second.plan.sessionsDone, first.plan.sessionsDone);
  });

  test("completedAt: una sesión hecha sin conexión conserva su fecha real", async () => {
    const { call, s2 } = await setup();
    const res = await call("POST", `/v1/sessions/${s2}/complete`, { completedAt: "2026-11-23T20:15:00.000Z" });
    assert.equal(res.json().session.doneAt, "2026-11-23T20:15:00.000Z");
  });

  test("completedAt futuro: 400; con un pequeño adelanto del reloj del celular se acepta (queda en la hora del servidor)", async () => {
    const { call, s2, s3, clock } = await setup();
    const future = new Date(clock.now().getTime() + 3600_000).toISOString();
    assert.equal((await call("POST", `/v1/sessions/${s2}/complete`, { completedAt: future })).statusCode, 400);
    const ahead = new Date(clock.now().getTime() + 60_000).toISOString();
    const res = await call("POST", `/v1/sessions/${s3}/complete`, { completedAt: ahead });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().session.doneAt, clock.now().toISOString());
  });

  test("sesión ajena o inexistente: 404 y no cambia nada", async () => {
    const { call, s2, other, store } = await setup();
    assert.equal((await call("POST", `/v1/sessions/${s2}/complete`, {}, other.accessToken)).statusCode, 404);
    assert.equal((await call("POST", "/v1/sessions/00000000-0000-4000-8000-000000000000/complete")).statusCode, 404);
    assert.equal(store.sessions.get(s2)!.doneAt, null);
  });
});

describe("audio", () => {
  test("un audio listo devuelve URL firmada, vencimiento, tamaño y versión", async () => {
    const { call, s2, clock } = await setup();
    const res = await call("GET", `/v1/sessions/${s2}/audio?minutes=15`);
    assert.equal(res.statusCode, 200);
    const body = SessionAudioResponseSchema.parse(res.json());
    assert.equal(body.status, "lista");
    assert.ok(body.url!.includes("firmado"));
    assert.equal(body.expiresAt, new Date(clock.now().getTime() + 3600_000).toISOString());
    assert.deepEqual([body.format, body.bytes, body.durationSeconds, body.version], ["m4a", 4_000_000, 900, "v2"]);
  });

  test("un audio en generación no tiene URL", async () => {
    const { call, s3 } = await setup();
    const body = SessionAudioResponseSchema.parse((await call("GET", `/v1/sessions/${s3}/audio?minutes=5`)).json());
    assert.deepEqual([body.status, body.url, body.version], ["generando", null, null]);
  });

  test("una duración que nunca se pidió: 404. Duración o sesión inválidas: 400 y 404", async () => {
    const { call, s2, other } = await setup();
    assert.equal((await call("GET", `/v1/sessions/${s2}/audio?minutes=10`)).statusCode, 404);
    assert.equal((await call("GET", `/v1/sessions/${s2}/audio?minutes=7`)).statusCode, 400);
    assert.equal((await call("GET", `/v1/sessions/${s2}/audio`)).statusCode, 400);
    assert.equal((await call("GET", `/v1/sessions/${s2}/audio?minutes=5`, undefined, other.accessToken)).statusCode, 404);
  });

  test("un audio «lista» sin archivo se informa como error", async () => {
    const { call, s1, store, device } = await setup();
    store.addAudio(device.userId, s1, { minutes: 10, storagePath: null });
    assert.equal((await call("GET", `/v1/sessions/${s1}/audio?minutes=10`)).json().status, "error");
  });

  test("POST audio no está habilitada en el MVP: 503 offline_generation_unavailable", async () => {
    const { call, s2, other } = await setup();
    const res = await call("POST", `/v1/sessions/${s2}/audio`, { minutes: 10 });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, "offline_generation_unavailable");
    assert.equal((await call("POST", `/v1/sessions/${s2}/audio`, { minutes: 7 })).statusCode, 400);
    assert.equal((await call("POST", `/v1/sessions/${s2}/audio`, { minutes: 10 }, other.accessToken)).statusCode, 404);
  });
});
