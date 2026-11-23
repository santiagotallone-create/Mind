import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { WebSocket } from "ws";
import { VoiceTicketResponseSchema } from "../contract/index.js";
import { MemoryStore } from "../store/memory.js";
import { FakeProvider, FakeSummarizer } from "../testing/fakes.js";
import { bearer, FakeClock, FakeMonotonic, registerDevice, testEnv, type RegisteredDevice } from "../testing/helpers.js";
import { buildApp } from "./app.js";

const apps: Array<{ close(): Promise<unknown> }> = [];
afterEach(async () => {
  while (sockets.length) sockets.pop()!.terminate();
  while (apps.length) await apps.pop()!.close();
});

async function setup(envOverrides: Parameters<typeof testEnv>[0] = {}) {
  const clock = new FakeClock(new Date("2026-11-23T10:00:00+01:00"));
  const mono = new FakeMonotonic();
  const store = new MemoryStore();
  const providers: FakeProvider[] = [];
  const summarizer = new FakeSummarizer();
  const app = buildApp({
    env: testEnv({ accessTokenSeconds: 86_400, ...envOverrides}),
    store,
    clock: clock.now,
    monotonicNow: mono.now,
    summarizer,
    providerFactory: () => {
      const provider = new FakeProvider();
      providers.push(provider);
      return provider;
    },
  });
  apps.push(app);
  await app.ready();
  const device = await registerDevice(app);
  const ticket = (token: string, payload: unknown = { talkType: "libre" }) =>
    app.inject({ method: "POST", url: "/v1/voice/tickets", headers: bearer(token), payload: payload as object });
  return { app, clock, mono, store, providers, summarizer, device, ticket };
}

/** Abre un WebSocket real contra la app (en un puerto libre) y va guardando los mensajes JSON que llegan. */
async function openSocket(app: Awaited<ReturnType<typeof setup>>["app"], wsUrl: string, headers: Record<string, string> = {}) {
  if (!app.server.listening) await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  const url = new URL(wsUrl);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${url.pathname}${url.search}`, { headers });
  const events: any[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (data, isBinary) => {
    if (!isBinary) events.push(JSON.parse(data.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  // Un ticket rechazado cierra enseguida: el error llega igual, así que no se espera solo "open".
  await new Promise<void>((resolve) => {
    ws.once("open", () => resolve());
    ws.once("close", () => resolve());
    ws.once("error", () => resolve());
  });
  const until = async (predicate: (e: any[]) => boolean) => {
    for (let i = 0; i < 300 && !predicate(events); i++) await new Promise<void>((r) => (waiters.push(r), setTimeout(r, 10)));
    return events;
  };
  sockets.push(ws);
  return { ws, events, until };
}
const sockets: WebSocket[] = [];

describe("POST /v1/voice/tickets", () => {
  test("devuelve talkId, ticket y la dirección del WebSocket con el formato del contrato", async () => {
    const { ticket, device } = await setup({ publicUrl: "https://coach.example.com/" });
    const res = await ticket(device.accessToken);
    assert.equal(res.statusCode, 200);
    const body = VoiceTicketResponseSchema.parse(res.json());
    assert.equal(body.expiresInSeconds, 60);
    assert.ok(body.wsUrl.startsWith("wss://coach.example.com/v1/voice?ticket="));
    assert.ok(body.wsUrl.endsWith(body.ticket));
  });

  test("sin token de acceso: 401", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "POST", url: "/v1/voice/tickets", payload: { talkType: "libre" } });
    assert.equal(res.statusCode, 401);
  });

  test("cuerpo inválido: 400", async () => {
    const { ticket, device } = await setup();
    assert.equal((await ticket(device.accessToken, { talkType: "otra_cosa" })).statusCode, 400);
  });

  test("con el saldo en cero el servidor se niega: 403 quota_exhausted, sin crear charla", async () => {
    const { app, store, device, ticket } = await setup();
    const earlier = await store.createTalk({ userId: device.userId, type: "libre" });
    const period = await app.ctx.quota.activate(device.userId);
    await app.ctx.quota.chargeTalk({ talkId: earlier.id, periodId: period.id, activeSeconds: 7200 });
    const talksBefore = store.talks.size;
    const res = await ticket(device.accessToken);
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, "quota_exhausted");
    assert.equal(store.talks.size, talksBefore);
  });

  test("los seis tipos de charla se bloquean con el saldo en cero", async () => {
    const { app, store, device, ticket } = await setup();
    const earlier = await store.createTalk({ userId: device.userId, type: "libre" });
    const period = await app.ctx.quota.activate(device.userId);
    await app.ctx.quota.chargeTalk({ talkId: earlier.id, periodId: period.id, activeSeconds: 7200 });
    const planId = store.addPlan(device.userId, { name: "Mi plan" });
    const sessionId = store.addSession(device.userId, planId, { title: "Sesión 1" });
    for (const talkType of ["libre", "entrevista", "cierre", "plan", "meditacion", "plan_nuevo"]) {
      const res = await ticket(device.accessToken, { talkType, planId, sessionId });
      assert.equal(res.statusCode, 403, talkType);
    }
  });

  test("un plan o una sesión de otra persona: 404", async () => {
    const { app, store, device, ticket } = await setup();
    const other = await registerDevice(app);
    const planId = store.addPlan(other.userId, { name: "Plan ajeno" });
    const sessionId = store.addSession(other.userId, planId, { title: "Sesión ajena" });
    assert.equal((await ticket(device.accessToken, { talkType: "plan", planId })).statusCode, 404);
    assert.equal((await ticket(device.accessToken, { talkType: "meditacion", sessionId })).statusCode, 404);
  });

  test("límite de 10 tickets nuevos por hora y por usuario", async () => {
    const { ticket, device, clock } = await setup();
    for (let i = 0; i < 10; i++) assert.equal((await ticket(device.accessToken)).statusCode, 200);
    const blocked = await ticket(device.accessToken);
    assert.equal(blocked.statusCode, 429);
    clock.advanceSeconds(3601);
    assert.equal((await ticket(device.accessToken)).statusCode, 200);
  });

  test("retomar una charla que no existe o ya terminó: 404", async () => {
    const { ticket, device } = await setup();
    const res = await ticket(device.accessToken, { talkType: "libre", resumeTalkId: "00000000-0000-4000-8000-000000000000" });
    assert.equal(res.statusCode, 404);
  });
});

describe("WebSocket /v1/voice", () => {
  async function connect(ctx: Awaited<ReturnType<typeof setup>>, device: RegisteredDevice = ctx.device) {
    const body = (await ctx.ticket(device.accessToken)).json();
    return { body, ...(await openSocket(ctx.app, body.wsUrl)) };
  }

  test("con un ticket válido arranca la charla: ready, audio del coach y fin con el consumo descontado", async () => {
    const ctx = await setup();
    const { ws, body, events, until } = await connect(ctx);
    await until((e) => e.some((m) => m.type === "ready"));
    assert.equal(events.find((m) => m.type === "ready").talkId, body.talkId);
    assert.equal(ctx.providers.length, 1);
    assert.ok(ctx.providers[0]!.config!.instructions.length > 100, "el coach recibe sus instrucciones");

    ws.send(Buffer.alloc(960), { binary: true });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(ctx.providers[0]!.audioFromUser.length, 1);

    ctx.mono.advance(42);
    ctx.clock.advanceSeconds(42);
    await ctx.app.ctx.voice.tickAll();
    ws.send(JSON.stringify({ type: "end" }));
    await until((e) => e.some((m) => m.type === "ended"));
    assert.equal(events.find((m) => m.type === "ended").reason, "usuario");
    assert.equal((await ctx.app.ctx.quota.getStatus(ctx.device.userId)).secondsRemaining, 7200 - 42);
    assert.equal(ctx.app.ctx.voice.openTalks, 0);
  });

  test("el ticket es de un solo uso", async () => {
    const ctx = await setup();
    const { body } = await connect(ctx);
    const { until, events } = await openSocket(ctx.app, body.wsUrl);
    await until((e) => e.length > 0);
    assert.deepEqual(events[0], { type: "error", code: "invalid_ticket", retryable: false });
    assert.equal(ctx.providers.length, 1);
  });

  test("un ticket inventado o vencido no abre nada", async () => {
    const ctx = await setup();
    const fake = await openSocket(ctx.app, "http://x/v1/voice?ticket=inventado");
    await fake.until((e) => e.length > 0);
    assert.equal(fake.events[0].code, "invalid_ticket");

    const body = (await ctx.ticket(ctx.device.accessToken)).json();
    ctx.clock.advanceSeconds(61);
    const expired = await openSocket(ctx.app, body.wsUrl);
    await expired.until((e) => e.length > 0);
    assert.equal(expired.events[0].code, "invalid_ticket");
    assert.equal(ctx.providers.length, 0);
  });

  test("un ticket sin usar no deja la charla abierta: se cierra con corte y no consume", async () => {
    const ctx = await setup();
    const body = (await ctx.ticket(ctx.device.accessToken)).json();
    ctx.clock.advanceSeconds(70);
    await ctx.app.ctx.voice.tickAll();
    await new Promise((r) => setTimeout(r, 10));
    const talk = ctx.store.talks.get(body.talkId)!;
    assert.equal(talk.endReason, "corte");
    assert.equal(talk.activeSeconds, 0);
  });

  test("se rechaza un origen que no está en ALLOWED_ORIGINS", async () => {
    const ctx = await setup({ allowedOrigins: ["https://pwa.example.com"] });
    const body = (await ctx.ticket(ctx.device.accessToken)).json();
    const { events, until } = await openSocket(ctx.app, body.wsUrl, { origin: "https://malo.example.com" });
    await until((e) => e.length > 0);
    assert.equal(events[0].code, "origin_not_allowed");
    assert.equal(ctx.providers.length, 0);
  });

  test("reconexión: nuevo ticket con resumeTalkId retoma la misma charla sin cortar el motor", async () => {
    const ctx = await setup();
    const first = await connect(ctx);
    await first.until((e) => e.some((m) => m.type === "ready"));
    first.ws.terminate();
    await new Promise((r) => setTimeout(r, 20));

    const resumeBody = (await ctx.ticket(ctx.device.accessToken, { talkType: "libre", resumeTalkId: first.body.talkId })).json();
    assert.equal(resumeBody.talkId, first.body.talkId);
    const second = await openSocket(ctx.app, resumeBody.wsUrl);
    await second.until((e) => e.some((m) => m.type === "ready"));
    assert.equal(second.events.find((m) => m.type === "ready").talkId, first.body.talkId);
    assert.equal(ctx.providers.length, 1, "no se abre otro motor");
    assert.equal(ctx.providers[0]!.closed, false);
  });

  test("retomar la charla de otra persona: 404", async () => {
    const ctx = await setup();
    const first = await connect(ctx);
    await first.until((e) => e.some((m) => m.type === "ready"));
    const other = await registerDevice(ctx.app);
    const res = await ctx.ticket(other.accessToken, { talkType: "libre", resumeTalkId: first.body.talkId });
    assert.equal(res.statusCode, 404);
  });

  test("pasada la gracia de reconexión la charla se cierra con corte y retomarla da 404", async () => {
    const ctx = await setup();
    const first = await connect(ctx);
    await first.until((e) => e.some((m) => m.type === "ready"));
    first.ws.terminate();
    await new Promise((r) => setTimeout(r, 20));
    for (let i = 0; i < 61; i++) {
      ctx.mono.advance(1);
      ctx.clock.advanceSeconds(1);
      await ctx.app.ctx.voice.tickAll();
    }
    assert.equal(ctx.store.talks.get(first.body.talkId)!.endReason, "corte");
    const res = await ctx.ticket(ctx.device.accessToken, { talkType: "libre", resumeTalkId: first.body.talkId });
    assert.equal(res.statusCode, 404);
  });

  test("apagar el servidor cierra las charlas abiertas y guarda lo consumido", async () => {
    const ctx = await setup();
    const { until } = await connect(ctx);
    await until((e) => e.some((m) => m.type === "ready"));
    ctx.mono.advance(15);
    await ctx.app.ctx.voice.shutdown();
    assert.equal(ctx.app.ctx.voice.openTalks, 0);
    assert.equal((await ctx.app.ctx.quota.getStatus(ctx.device.userId)).secondsRemaining, 7200 - 15);
  });

  test("al arrancar se cierran las charlas que quedaron abiertas por un reinicio", async () => {
    const clock = new FakeClock(new Date("2026-11-23T10:00:00+01:00"));
    const store = new MemoryStore();
    const { userId } = await store.createUserWithDevice({ secretHash: "x" });
    const orphan = await store.createTalk({ userId, type: "libre", startedAt: clock.now() });
    const app = buildApp({ env: testEnv(), store, clock: clock.now });
    apps.push(app);
    await app.ready();
    assert.equal(store.talks.get(orphan.id)!.endReason, "error");
  });

  test("al empezar una charla se completa el resumen pendiente de la anterior", async () => {
    const ctx = await setup();
    ctx.summarizer.fail = true;
    const first = await connect(ctx);
    await first.until((e) => e.some((m) => m.type === "ready"));
    ctx.providers[0]!.userSpeaks("Hoy medité diez minutos");
    first.ws.send(JSON.stringify({ type: "end" }));
    await first.until((e) => e.some((m) => m.type === "ended"));
    assert.equal(ctx.store.memory.length, 0);

    ctx.summarizer.fail = false;
    const second = await connect(ctx);
    await second.until((e) => e.some((m) => m.type === "ready"));
    assert.equal(ctx.store.memory.length, 1);
    assert.equal(ctx.store.transcripts.size, 0);
    assert.ok(ctx.providers[1]!.config!.instructions.includes("Resumen de"), "el coach recibe el resumen de la charla anterior");
  });

  test("las herramientas del coach guardan datos: velocidad y perfil", async () => {
    const ctx = await setup();
    const { until } = await connect(ctx);
    await until((e) => e.some((m) => m.type === "ready"));
    const provider = ctx.providers[0]!;
    assert.deepEqual(await provider.callTool("ajustar_velocidad", { velocidad: 0.85 }), { ok: true, velocidad_actual: 0.85 });
    assert.deepEqual(provider.speeds, [0.85]);
    assert.equal((await ctx.store.getSettings(ctx.device.userId)).voiceSpeed, 0.85);
    assert.deepEqual(await provider.callTool("guardar_perfil", { objetivos: "dormir mejor" }), { ok: true });
    assert.equal((await ctx.store.getProfile(ctx.device.userId))?.goals, "dormir mejor");
  });
});

describe("CORS", () => {
  test("responde a la consulta previa solo para los orígenes permitidos", async () => {
    const { app } = await setup({ allowedOrigins: ["https://pwa.example.com"] });
    const ok = await app.inject({
      method: "OPTIONS",
      url: "/v1/voice/tickets",
      headers: { origin: "https://pwa.example.com", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" },
    });
    assert.equal(ok.statusCode, 204);
    assert.equal(ok.headers["access-control-allow-origin"], "https://pwa.example.com");

    const bad = await app.inject({
      method: "OPTIONS",
      url: "/v1/voice/tickets",
      headers: { origin: "https://malo.example.com", "access-control-request-method": "POST" },
    });
    assert.equal(bad.headers["access-control-allow-origin"], undefined);
  });

  test("sin ALLOWED_ORIGINS no se habilita ningún origen", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "OPTIONS", url: "/v1/quota", headers: { origin: "https://x.example.com", "access-control-request-method": "GET" } });
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
});
