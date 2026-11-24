import assert from "node:assert/strict";
import { test } from "node:test";
import { QuotaStatusSchema } from "../contract/index.js";
import { MemoryStore } from "../store/memory.js";
import { bearer, FakeClock, registerDevice, testEnv } from "../testing/helpers.js";
import { buildApp } from "./app.js";

function setup() {
  const clock = new FakeClock(new Date("2026-11-23T10:00:00+01:00"));
  const store = new MemoryStore();
  const app = buildApp({ env: testEnv(), store, clock: clock.now });
  return { app, store, clock };
}

const getQuota = async (app: ReturnType<typeof setup>["app"], token: string) => {
  const res = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(token) });
  assert.equal(res.statusCode, 200);
  return QuotaStatusSchema.parse(res.json());
};

test("GET /v1/quota: sin iniciar, disponible y agotado, siempre con el formato del contrato", async () => {
  const { app, store } = setup();
  const device = await registerDevice(app);
  const fresh = await getQuota(app, device.accessToken);
  assert.equal(fresh.state, "sin_iniciar");
  assert.equal(fresh.renewsOn, null);

  const talk = await store.createTalk({ userId: device.userId, type: "entrevista" });
  const period = await app.ctx.quota.activate(device.userId);
  await app.ctx.quota.chargeTalk({ talkId: talk.id, periodId: period.id, activeSeconds: 1800 });
  const used = await getQuota(app, device.accessToken);
  assert.equal(used.state, "disponible");
  assert.equal(used.minutesRemaining, 90);
  assert.equal(used.renewsOn, "2026-12-23");

  await app.ctx.quota.chargeTalk({ talkId: talk.id, periodId: period.id, activeSeconds: 7200 });
  const empty = await getQuota(app, device.accessToken);
  assert.equal(empty.state, "agotado");
  assert.equal(empty.minutesRemaining, 0);
  assert.equal(empty.renewsOn, "2026-12-23");
});

test("el bolsón de un usuario no se ve ni se toca desde otro", async () => {
  const { app, store } = setup();
  const a = await registerDevice(app);
  const b = await registerDevice(app);
  const talk = await store.createTalk({ userId: a.userId, type: "libre" });
  const period = await app.ctx.quota.activate(a.userId);
  await app.ctx.quota.chargeTalk({ talkId: talk.id, periodId: period.id, activeSeconds: 7200 });
  assert.equal((await getQuota(app, a.accessToken)).state, "agotado");
  const other = await getQuota(app, b.accessToken);
  assert.equal(other.state, "sin_iniciar");
  assert.equal(other.secondsRemaining, 7200);
});

test("la app no puede alterar el saldo: GET /v1/quota es de solo lectura y no hay rutas de escritura", async () => {
  const { app } = setup();
  const device = await registerDevice(app);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    const res = await app.inject({ method, url: "/v1/quota", headers: bearer(device.accessToken), payload: { secondsRemaining: 99999 } });
    assert.equal(res.statusCode, 404);
  }
  assert.equal((await getQuota(app, device.accessToken)).secondsRemaining, 7200);
});
