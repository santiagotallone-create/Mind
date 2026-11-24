import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../server/errors.js";
import { MemoryStore } from "../store/memory.js";
import { FakeClock } from "../testing/helpers.js";
import { QuotaService, QUOTA_SECONDS_TOTAL } from "./service.js";

async function setup(startIso = "2026-11-23T10:00:00+01:00") {
  const clock = new FakeClock(new Date(startIso));
  const store = new MemoryStore();
  const quota = new QuotaService({ store, clock: clock.now });
  const { userId } = await store.createUserWithDevice({ secretHash: "x" });
  return { clock, store, quota, userId };
}

/** Simula una charla: la crea, activa el periodo y descuenta `seconds` de tiempo activo. */
async function talk(ctx: Awaited<ReturnType<typeof setup>>, seconds: number, type: "libre" | "entrevista" | "cierre" = "libre") {
  const created = await ctx.store.createTalk({ userId: ctx.userId, type, startedAt: ctx.clock.now() });
  const period = await ctx.quota.activate(ctx.userId);
  const { secondsRemaining } = await ctx.quota.chargeTalk({ talkId: created.id, periodId: period.id, activeSeconds: seconds });
  return { talkId: created.id, period, secondsRemaining };
}

test("un usuario nuevo está sin_iniciar, con el saldo completo y sin fecha de renovación", async () => {
  const { quota, userId } = await setup();
  assert.deepEqual(await quota.getStatus(userId), {
    state: "sin_iniciar",
    secondsTotal: QUOTA_SECONDS_TOTAL,
    secondsRemaining: 7200,
    minutesRemaining: 120,
    periodStartsAt: null,
    renewsOn: null,
  });
});

test("consultar el saldo no abre el periodo", async () => {
  const { quota, userId, store } = await setup();
  await quota.getStatus(userId);
  await quota.assertCanStart(userId);
  assert.equal(store.periods.size, 0);
});

test("la primera charla activa el bolsón: periodo de un mes con fecha de renovación explícita", async () => {
  const ctx = await setup();
  await talk(ctx, 300);
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.state, "disponible");
  assert.equal(status.secondsRemaining, 6900);
  assert.equal(status.minutesRemaining, 115);
  assert.equal(status.renewsOn, "2026-12-23");
  assert.equal(status.periodStartsAt, new Date("2026-11-23T10:00:00+01:00").toISOString());
});

test("los minutos restantes se redondean hacia abajo", async () => {
  const ctx = await setup();
  await talk(ctx, 61);
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.secondsRemaining, 7139);
  assert.equal(status.minutesRemaining, 118);
});

test("activar dos veces seguidas, o a la vez, no crea dos periodos", async () => {
  const { quota, userId, store } = await setup();
  const [a, b] = await Promise.all([quota.activate(userId), quota.activate(userId)]);
  const c = await quota.activate(userId);
  assert.equal(a.id, b.id);
  assert.equal(a.id, c.id);
  assert.equal(store.periods.size, 1);
});

test("descontar es idempotente y monótono: repetir o mandar un total menor no descuenta de más", async () => {
  const ctx = await setup();
  const { talkId, period } = await talk(ctx, 100);
  await ctx.quota.chargeTalk({ talkId, periodId: period.id, activeSeconds: 100 });
  await ctx.quota.chargeTalk({ talkId, periodId: period.id, activeSeconds: 40 });
  assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7100);
  await ctx.quota.chargeTalk({ talkId, periodId: period.id, activeSeconds: 130 });
  assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7070);
});

test("saldo que llega a cero: estado agotado y el servidor bloquea charlas nuevas", async () => {
  const ctx = await setup();
  await talk(ctx, 7200);
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.state, "agotado");
  assert.equal(status.secondsRemaining, 0);
  assert.equal(status.minutesRemaining, 0);
  assert.equal(status.renewsOn, "2026-12-23");
  await assert.rejects(
    () => ctx.quota.assertCanStart(ctx.userId),
    (error) => error instanceof ApiError && error.code === "quota_exhausted" && error.statusCode === 403,
  );
});

test("el saldo nunca queda en negativo: pasarse del total (margen de la despedida) no descuenta de más", async () => {
  const ctx = await setup();
  const { talkId, period } = await talk(ctx, 7190);
  const result = await ctx.quota.chargeTalk({ talkId, periodId: period.id, activeSeconds: 7200 + 9 });
  assert.equal(result.secondsRemaining, 0);
  assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 0);
  assert.equal(ctx.store.periods.get(period.id)!.secondsUsed, 7200);
  // La charla sí guarda el tiempo real.
  assert.equal(ctx.store.talks.get(talkId)!.activeSeconds, 7209);
});

test("dos charlas seguidas se suman en el mismo periodo", async () => {
  const ctx = await setup();
  const first = await talk(ctx, 600);
  ctx.clock.advanceSeconds(5);
  const second = await talk(ctx, 300);
  assert.equal(first.period.id, second.period.id);
  assert.equal(second.secondsRemaining, 7200 - 900);
});

test("cambio de mes: el periodo sigue abierto hasta el instante exacto de su vencimiento", async () => {
  const ctx = await setup();
  await talk(ctx, 7200);
  assert.equal((await ctx.quota.getStatus(ctx.userId)).state, "agotado");
  ctx.clock.set("2026-12-23T09:59:59+01:00");
  assert.equal((await ctx.quota.getStatus(ctx.userId)).state, "agotado");
  ctx.clock.set("2026-12-23T10:00:00+01:00");
  const renewed = await ctx.quota.getStatus(ctx.userId);
  assert.equal(renewed.state, "sin_iniciar");
  assert.equal(renewed.secondsRemaining, 7200);
  assert.equal(renewed.renewsOn, null);
  await ctx.quota.assertCanStart(ctx.userId); // ya no está bloqueado
});

test("vencimiento sin uso posterior: sigue sin_iniciar con el saldo completo, sin abrir periodo nuevo", async () => {
  const ctx = await setup();
  await talk(ctx, 1000);
  ctx.clock.set("2027-03-01T09:00:00+01:00");
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.state, "sin_iniciar");
  assert.equal(status.secondsRemaining, 7200);
  assert.equal(status.periodStartsAt, null);
  assert.equal(ctx.store.periods.size, 1);
});

test("primera charla tras vencer: abre un periodo nuevo completo que empieza en ese momento", async () => {
  const ctx = await setup();
  await talk(ctx, 7200);
  ctx.clock.set("2027-01-10T18:30:00+01:00");
  const { period } = await talk(ctx, 60);
  assert.equal(period.startsAt.toISOString(), new Date("2027-01-10T18:30:00+01:00").toISOString());
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.state, "disponible");
  assert.equal(status.secondsRemaining, 7140);
  assert.equal(status.renewsOn, "2027-02-10");
  assert.equal(ctx.store.periods.size, 2);
});

test("mes sin ese día: la primera charla del 31 vence el último día del mes siguiente", async () => {
  const ctx = await setup("2027-01-31T20:00:00+01:00");
  await talk(ctx, 10);
  assert.equal((await ctx.quota.getStatus(ctx.userId)).renewsOn, "2027-02-28");
});

test("una charla que cruza el vencimiento descuenta del periodo donde empezó, no del nuevo", async () => {
  const ctx = await setup();
  const first = await talk(ctx, 100);
  ctx.clock.set("2026-12-23T10:05:00+01:00"); // el periodo ya venció con la charla en curso
  const result = await ctx.quota.chargeTalk({ talkId: first.talkId, periodId: first.period.id, activeSeconds: 400 });
  assert.equal(result.secondsRemaining, 7200 - 400);
  // El bolsón vigente es "sin_iniciar": no se abrió un periodo nuevo por el descuento.
  const status = await ctx.quota.getStatus(ctx.userId);
  assert.equal(status.state, "sin_iniciar");
  assert.equal(ctx.store.periods.size, 1);
});

test("la fecha de renovación se calcula en la zona horaria del usuario", async () => {
  const ctx = await setup("2026-11-24T01:30:00Z");
  ctx.store.users.get(ctx.userId)!.timezone = "America/Argentina/Buenos_Aires";
  await talk(ctx, 10);
  // 23 de noviembre 22:30 en Buenos Aires -> vence el 23 de diciembre allí.
  assert.equal((await ctx.quota.getStatus(ctx.userId)).renewsOn, "2026-12-23");
  ctx.store.users.get(ctx.userId)!.timezone = "Europe/Rome";
  assert.equal((await ctx.quota.getStatus(ctx.userId)).renewsOn, "2026-12-24");
});

test("una zona horaria inválida guardada no rompe la consulta", async () => {
  const ctx = await setup();
  ctx.store.users.get(ctx.userId)!.timezone = "no-existe";
  await talk(ctx, 10);
  assert.equal((await ctx.quota.getStatus(ctx.userId)).renewsOn, "2026-12-23");
});

test("el consumo de un usuario no afecta a otro", async () => {
  const ctx = await setup();
  const other = await ctx.store.createUserWithDevice({ secretHash: "y" });
  await talk(ctx, 7200);
  assert.equal((await ctx.quota.getStatus(other.userId)).state, "sin_iniciar");
  await ctx.quota.assertCanStart(other.userId);
});

test("no se puede descontar de un periodo de otro usuario", async () => {
  const ctx = await setup();
  const other = await ctx.store.createUserWithDevice({ secretHash: "y" });
  const otherPeriod = await ctx.quota.activate(other.userId);
  const mine = await ctx.store.createTalk({ userId: ctx.userId, type: "libre" });
  await assert.rejects(() => ctx.quota.chargeTalk({ talkId: mine.id, periodId: otherPeriod.id, activeSeconds: 60 }));
  assert.equal(ctx.store.periods.get(otherPeriod.id)!.secondsUsed, 0);
});

test("el consumo por charla queda registrado por tipo", async () => {
  const ctx = await setup();
  await talk(ctx, 300, "entrevista");
  await talk(ctx, 120, "libre");
  const { period } = await talk(ctx, 200, "libre");
  await talk(ctx, 280, "cierre");
  const usage = await ctx.quota.usageByType(ctx.userId, period.id);
  const byType = Object.fromEntries(usage.map((u) => [u.type, { talks: u.talks, seconds: u.activeSeconds }]));
  assert.deepEqual(byType, {
    entrevista: { talks: 1, seconds: 300 },
    libre: { talks: 2, seconds: 320 },
    cierre: { talks: 1, seconds: 280 },
  });
});
