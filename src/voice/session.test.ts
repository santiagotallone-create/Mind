import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { CoachMemory } from "../coach/memory.js";
import { createCoachTools } from "../coach/tools.js";
import { QuotaService } from "../quota/service.js";
import { testEnv, FakeClock, FakeMonotonic } from "../testing/helpers.js";
import { FakeProvider, FakeSocket, FakeSummarizer, silentLog } from "../testing/fakes.js";
import { MemoryStore } from "../store/memory.js";
import { VoiceSession } from "./session.js";
import { stringsFor } from "./strings.js";

const LIMITS = testEnv().voice;
const PCM_SECOND = 48_000;

async function setup(opts: { usedBefore?: number; limits?: Partial<typeof LIMITS> } = {}) {
  const clock = new FakeClock(new Date("2026-11-23T10:00:00+01:00"));
  const mono = new FakeMonotonic();
  const store = new MemoryStore();
  const quota = new QuotaService({ store, clock: clock.now });
  const summarizer = new FakeSummarizer();
  const memory = new CoachMemory(store, summarizer, silentLog);
  const { userId } = await store.createUserWithDevice({ secretHash: "x" });
  if (opts.usedBefore) {
    const earlier = await store.createTalk({ userId, type: "libre" });
    const period = await quota.activate(userId);
    await quota.chargeTalk({ talkId: earlier.id, periodId: period.id, activeSeconds: opts.usedBefore });
    await store.closeTalk(earlier.id, { endedAt: clock.now(), endReason: "usuario" });
  }
  const talk = await store.createTalk({ userId, type: "libre" });
  const provider = new FakeProvider();
  const socket = new FakeSocket();
  const closedTalks: string[] = [];
  const tools = createCoachTools({ ajustar_velocidad: async ({ velocidad }) => ({ ok: true, velocidad_actual: velocidad }) });
  const session = new VoiceSession({
    userId,
    talk,
    provider,
    providerConfig: { language: "es", instructions: "prompt" },
    tools,
    store,
    quota,
    memory,
    limits: { ...LIMITS, ...opts.limits },
    strings: stringsFor("es"),
    now: mono.now,
    clock: clock.now,
    log: silentLog,
    onClosed: (id) => closedTalks.push(id),
  });
  /** Avanza el tiempo y evalúa las reglas segundo a segundo, como lo hace el servicio. */
  const run = async (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      mono.advance(1);
      clock.advanceSeconds(1);
      await session.tick();
    }
  };
  return { clock, mono, store, quota, summarizer, userId, talk, provider, socket, session, closedTalks, run };
}

const control = (type: string) => Buffer.from(JSON.stringify({ type }));

describe("apertura", () => {
  test("abre la sesión del motor con las herramientas, avisa ready y activa el bolsón en ese momento", async () => {
    const { session, socket, provider, quota, userId, talk } = await setup();
    assert.equal((await quota.getStatus(userId)).state, "sin_iniciar");
    await session.start(socket);
    assert.deepEqual(socket.types, ["ready"]);
    assert.equal(socket.lastOf("ready")!.talkId, talk.id);
    assert.deepEqual(provider.config!.tools!.map((t) => t.name), ["ajustar_velocidad"]);
    assert.equal((await quota.getStatus(userId)).state, "disponible");
  });

  test("si el motor no conecta: error reintentable, cierra con error y NO abre el periodo del bolsón", async () => {
    const { session, socket, provider, quota, userId, store, talk } = await setup();
    provider.failOnStart = true;
    await session.start(socket);
    assert.deepEqual(socket.types, ["error", "ended"]);
    assert.deepEqual(socket.events[0], { type: "error", code: "start_failed", retryable: true });
    assert.equal(socket.lastOf("ended")!.reason, "error");
    assert.equal((await quota.getStatus(userId)).state, "sin_iniciar");
    assert.equal(provider.closed, false);
    assert.equal(store.talks.get(talk.id)!.endReason, "error");
  });

  test("con el saldo en cero al conectar, se cierra enseguida con cuota_agotada", async () => {
    const { session, socket } = await setup({ usedBefore: 7200 });
    await session.start(socket);
    assert.equal(socket.lastOf("ended")!.reason, "cuota_agotada");
    assert.equal(socket.types.includes("ready"), false);
  });
});

describe("audio y eventos", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await ctx.session.start(ctx.socket);
  });

  test("el audio de la app llega al motor y el del coach llega a la app", async () => {
    ctx.session.handleClientMessage(Buffer.alloc(960), true);
    assert.equal(ctx.provider.audioFromUser.length, 1);
    ctx.provider.coachSpeaks();
    assert.equal(ctx.socket.audio.length, 1);
  });

  test("interrupción del usuario: la app recibe interrupted", () => {
    ctx.provider.userSpeaks();
    assert.ok(ctx.socket.types.includes("interrupted"));
  });

  test("la transcripción se envía como evento interno y se guarda al respaldar", async () => {
    ctx.provider.userSpeaks("Hola, quiero meditar");
    ctx.provider.coachSays("Hola, ¿cómo estás?");
    assert.deepEqual(ctx.socket.events.filter((e) => e.type === "transcript").map((e: any) => [e.role, e.text]), [
      ["user", "Hola, quiero meditar"],
      ["coach", "Hola, ¿cómo estás?"],
    ]);
    await ctx.run(LIMITS.heartbeatSeconds);
    assert.equal(ctx.store.transcripts.get(ctx.talk.id)!.length, 2);
  });

  test("la transcripción del usuario no genera un segundo evento interrupted", () => {
    ctx.provider.userSpeaks("Hola");
    assert.equal(ctx.socket.events.filter((e) => e.type === "interrupted").length, 1);
  });

  test("un mensaje de control inválido responde error sin cerrar la charla", () => {
    ctx.session.handleClientMessage(Buffer.from("{no es json"), false);
    ctx.session.handleClientMessage(Buffer.from(JSON.stringify({ type: "borrar_todo" })), false);
    assert.deepEqual(ctx.socket.events.filter((e) => e.type === "error").length, 2);
    assert.equal(ctx.session.status.phase, "live");
  });

  test("la herramienta ajustar_velocidad llega al motor y devuelve el resultado", async () => {
    assert.deepEqual(await ctx.provider.callTool("ajustar_velocidad", { velocidad: 0.8 }), { ok: true, velocidad_actual: 0.8 });
    assert.deepEqual(await ctx.provider.callTool("crear_plan", {}), { ok: false, error: "herramienta_no_disponible" });
  });
});

describe("pausa y reanudar", () => {
  test("la pausa corta el audio en ambos sentidos y no descuenta; al reanudar sigue contando", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(30);
    ctx.session.handleClientMessage(control("pause"), false);
    assert.ok(ctx.socket.types.includes("paused"));
    assert.ok(ctx.provider.interrupts >= 1);
    await ctx.run(120);
    ctx.session.handleClientMessage(Buffer.alloc(960), true);
    ctx.provider.coachSpeaks();
    assert.equal(ctx.provider.audioFromUser.length, 0);
    assert.equal(ctx.socket.audio.length, 0);
    assert.equal(ctx.session.status.activeSeconds, 30);
    ctx.session.handleClientMessage(control("resume"), false);
    assert.ok(ctx.socket.types.includes("resumed"));
    await ctx.run(10);
    assert.equal(ctx.session.status.activeSeconds, 40);
  });

  test("una pausa de más de 10 minutos cierra la charla con inactividad", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    ctx.session.handleClientMessage(control("pause"), false);
    await ctx.run(LIMITS.pauseMaxSeconds - 1);
    assert.equal(ctx.session.status.phase, "live");
    await ctx.run(1);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "inactividad");
  });
});

describe("cierre", () => {
  test("el usuario termina: descuenta, guarda métricas y avisa", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    ctx.provider.userSpeaks("Quiero hablar de mi semana");
    await ctx.run(75);
    ctx.provider.userSpeaks("Gracias");
    ctx.session.handleClientMessage(control("end"), false);
    await ctx.session.close("usuario");
    assert.equal(ctx.socket.lastOf("ended")!.reason, "usuario");
    assert.equal(ctx.socket.closeCount, 1);
    assert.equal(ctx.provider.closed, true);
    const talk = ctx.store.talks.get(ctx.talk.id)!;
    assert.equal(talk.activeSeconds, 75);
    assert.equal(talk.endReason, "usuario");
    assert.equal(talk.metrics.activeSeconds, 75);
    assert.equal(talk.metrics.estimatedCostUsd, 0.01);
    assert.deepEqual(talk.metrics.responseLatenciesMs, [640]);
    assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7200 - 75);
    assert.deepEqual(ctx.closedTalks, [ctx.talk.id]);
  });

  test("cerrar dos veces no descuenta ni avisa dos veces", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(10);
    await Promise.all([ctx.session.close("usuario"), ctx.session.close("error")]);
    assert.equal(ctx.socket.events.filter((e) => e.type === "ended").length, 1);
    assert.equal(ctx.provider.closed, true);
    assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7190);
  });

  test("al cerrar se genera el resumen y se borra la transcripción: queda solo el resumen", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    ctx.provider.userSpeaks("Me cuesta concentrarme por las mañanas");
    ctx.provider.coachSays("Probemos con respirar un minuto antes de empezar");
    await ctx.run(5);
    await ctx.session.close("usuario");
    assert.equal(ctx.summarizer.calls.length, 1);
    assert.equal(ctx.store.transcripts.has(ctx.talk.id), false);
    assert.equal(ctx.store.memory.length, 1);
    assert.equal(ctx.store.memory[0]!.talkId, ctx.talk.id);
    // El resumen se hace antes de cerrar la conexión.
    assert.equal(ctx.socket.closeCount, 1);
  });

  test("si el resumen falla, la transcripción queda guardada para reintentar en la próxima charla", async () => {
    const ctx = await setup();
    ctx.summarizer.fail = true;
    await ctx.session.start(ctx.socket);
    ctx.provider.userSpeaks("Hoy practiqué diez minutos");
    await ctx.session.close("usuario");
    assert.equal(ctx.store.memory.length, 0);
    assert.equal(ctx.store.transcripts.get(ctx.talk.id)!.length, 1);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "usuario");
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.endReason, "usuario");
  });

  test("una charla en la que la persona no dijo nada no deja recuerdo", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    ctx.provider.coachSays("Hola, ¿estás ahí?");
    await ctx.session.close("inactividad");
    assert.equal(ctx.summarizer.calls.length, 0);
    assert.equal(ctx.store.transcripts.has(ctx.talk.id), false);
    assert.equal(ctx.store.memory.length, 0);
  });

  test("error del motor en plena charla: avisa y cierra con error, sin perder lo descontado", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(20);
    ctx.provider.fail();
    await ctx.session.close("error");
    assert.ok(ctx.socket.events.some((e) => e.type === "error" && e.code === "provider_error"));
    assert.equal(ctx.socket.lastOf("ended")!.reason, "error");
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, 20);
  });
});

describe("corte de red y reconexión", () => {
  test("el tiempo sin conexión no descuenta, y al reconectar sigue la misma charla", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(40);
    ctx.socket.close();
    ctx.session.handleSocketClosed(ctx.socket);
    assert.ok(ctx.provider.interrupts >= 1);
    await ctx.run(30);
    const second = new FakeSocket();
    assert.equal(ctx.session.attach(second), true);
    assert.deepEqual(second.types, ["ready"]);
    assert.equal(second.lastOf("ready")!.talkId, ctx.talk.id);
    await ctx.run(20);
    assert.equal(ctx.session.status.activeSeconds, 60);
    assert.equal(ctx.provider.closed, false);
  });

  test("si no vuelve en 60 segundos la charla se cierra con corte y se guarda lo medido", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(50);
    ctx.socket.close();
    ctx.session.handleSocketClosed(ctx.socket);
    await ctx.run(LIMITS.reconnectGraceSeconds - 1);
    assert.equal(ctx.session.status.phase, "live");
    await ctx.run(1);
    assert.equal(ctx.session.status.phase, "closed");
    const talk = ctx.store.talks.get(ctx.talk.id)!;
    assert.equal(talk.endReason, "corte");
    assert.equal(talk.activeSeconds, 50);
    assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7150);
  });

  test("después del cierre ya no se puede reconectar", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.session.close("usuario");
    assert.equal(ctx.session.attach(new FakeSocket()), false);
  });

  test("un corte mientras está en pausa: al reconectar sigue en pausa y sin descontar", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(10);
    ctx.session.handleClientMessage(control("pause"), false);
    ctx.socket.close();
    ctx.session.handleSocketClosed(ctx.socket);
    await ctx.run(20);
    const second = new FakeSocket();
    ctx.session.attach(second);
    assert.deepEqual(second.types, ["ready", "paused"]);
    await ctx.run(30);
    assert.equal(ctx.session.status.activeSeconds, 10);
  });

  test("el socket viejo que se cierra tarde no corta la conexión nueva", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    const second = new FakeSocket();
    ctx.session.attach(second);
    ctx.session.handleSocketClosed(ctx.socket);
    assert.equal(ctx.session.status.connected, true);
    assert.equal(ctx.socket.closeCount, 1);
  });

  test("si la app se va mientras la charla arranca, se trata como un corte", async () => {
    const ctx = await setup();
    const startPromise = ctx.session.start(ctx.socket);
    ctx.socket.isOpen = false;
    ctx.session.handleSocketClosed(ctx.socket);
    await startPromise;
    assert.equal(ctx.session.status.connected, false);
    const second = new FakeSocket();
    assert.equal(ctx.session.attach(second), true);
  });
});

describe("dos charlas seguidas", () => {
  test("la segunda parte del saldo que dejó la primera", async () => {
    const noInactivity = { inactivityPromptSeconds: 100_000 };
    const first = await setup({ limits: noInactivity });
    await first.session.start(first.socket);
    await first.run(300);
    await first.session.close("usuario");

    // Segunda charla del mismo usuario, sobre el mismo almacén.
    const talk = await first.store.createTalk({ userId: first.userId, type: "libre" });
    const provider = new FakeProvider();
    const socket = new FakeSocket();
    const mono = new FakeMonotonic();
    const session = new VoiceSession({
      userId: first.userId,
      talk,
      provider,
      providerConfig: { language: "es", instructions: "p" },
      tools: createCoachTools({}),
      store: first.store,
      quota: first.quota,
      memory: new CoachMemory(first.store, first.summarizer, silentLog),
      limits: { ...LIMITS, ...noInactivity },
      strings: stringsFor("es"),
      now: mono.now,
      clock: first.clock.now,
      log: silentLog,
      onClosed: () => {},
    });
    await session.start(socket);
    mono.advance(100);
    await session.tick();
    await session.close("usuario");
    assert.equal((await first.quota.getStatus(first.userId)).secondsRemaining, 7200 - 400);
    assert.equal(first.store.periods.size, 1);
  });
});

describe("despedida y fin del saldo", () => {
  test("a los 20 s del final el coach se despide; al terminar de hablar, en cero, se cierra con cuota_agotada", async () => {
    const ctx = await setup({ usedBefore: 7200 - 60 });
    await ctx.session.start(ctx.socket);
    await ctx.run(39);
    assert.equal(ctx.provider.said.length, 0);
    await ctx.run(1); // quedan 20 s
    assert.deepEqual(ctx.provider.said, [stringsFor("es").farewellQuota]);
    ctx.provider.coachSpeaks();
    ctx.provider.coachFinishesResponse();
    await ctx.run(19);
    assert.equal(ctx.session.status.phase, "live", "todavía queda 1 s de saldo");
    await ctx.run(1);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "cuota_agotada");
    assert.equal((await ctx.quota.getStatus(ctx.userId)).state, "agotado");
  });

  test("si el coach sigue hablando en cero, se espera como máximo 10 s de margen, sin descontar de más", async () => {
    const ctx = await setup({ usedBefore: 7200 - 30 });
    await ctx.session.start(ctx.socket);
    await ctx.run(10); // quedan 20 s: despedida
    ctx.provider.coachSpeaks();
    await ctx.run(20 + 9); // en cero y 9 s de margen: el coach no terminó
    assert.equal(ctx.session.status.phase, "live");
    await ctx.run(1);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "cuota_agotada");
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, 40);
    const period = [...ctx.store.periods.values()][0]!;
    assert.equal(period.secondsUsed, 7200);
    assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 0);
  });

  test("con menos de 20 s de saldo al empezar, el coach se despide de inmediato", async () => {
    const ctx = await setup({ usedBefore: 7200 - 15 });
    await ctx.session.start(ctx.socket);
    await ctx.run(1);
    assert.equal(ctx.provider.said.length, 1);
  });

  test("durante la despedida no se aplica la regla de inactividad", async () => {
    const ctx = await setup({ usedBefore: 7200 - 40, limits: { inactivityPromptSeconds: 10, inactivityCloseSeconds: 5 } });
    await ctx.session.start(ctx.socket);
    await ctx.run(8);
    ctx.provider.userSpeaks();
    await ctx.run(8);
    ctx.provider.userSpeaks();
    await ctx.run(4); // quedan 20 s: despedida
    assert.deepEqual(ctx.provider.said, [stringsFor("es").farewellQuota]);
    await ctx.run(15); // sin hablar desde hace 19 s: sin la excepción habría preguntado y cerrado
    assert.deepEqual(ctx.provider.said, [stringsFor("es").farewellQuota]);
    assert.equal(ctx.session.status.phase, "live");
  });

  test("el tope de 30 minutos cierra con limite_duracion, también con despedida", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    const keepTalking = async (seconds: number) => {
      for (let i = 0; i < seconds; i++) {
        if (i % 30 === 0) ctx.provider.userSpeaks();
        await ctx.run(1);
      }
    };
    await keepTalking(LIMITS.maxTalkSeconds - LIMITS.farewellWarningSeconds);
    assert.deepEqual(ctx.provider.said, [stringsFor("es").farewellLimit]);
    ctx.provider.coachSpeaks();
    ctx.provider.coachFinishesResponse();
    await keepTalking(LIMITS.farewellWarningSeconds);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "limite_duracion");
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, LIMITS.maxTalkSeconds);
  });

  test("otra charla gastó del mismo periodo: manda el saldo real de la base", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    // Otra charla (doble toque) gasta casi todo el saldo del mismo periodo.
    const other = await ctx.store.createTalk({ userId: ctx.userId, type: "libre" });
    const period = [...ctx.store.periods.values()][0]!;
    await ctx.quota.chargeTalk({ talkId: other.id, periodId: period.id, activeSeconds: 7100 });
    await ctx.run(LIMITS.heartbeatSeconds); // respaldo: se entera
    await ctx.run(70);
    assert.ok(ctx.provider.said.includes(stringsFor("es").farewellQuota));
  });
});

describe("inactividad", () => {
  test("a los 60 s sin que nadie hable el coach pregunta si sigue ahí; a los 20 s más sin respuesta se cierra", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(59);
    assert.equal(ctx.provider.said.length, 0);
    await ctx.run(1);
    assert.deepEqual(ctx.provider.said, [stringsFor("es").inactivityPrompt]);
    ctx.provider.coachSpeaks(); // el coach hace la pregunta
    await ctx.run(19);
    assert.equal(ctx.session.status.phase, "live");
    await ctx.run(1);
    assert.equal(ctx.socket.lastOf("ended")!.reason, "inactividad");
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, 60 + 20);
  });

  test("si la persona responde, el contador vuelve a cero", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(60);
    ctx.provider.coachSpeaks();
    await ctx.run(10);
    ctx.provider.userSpeaks("Sí, acá estoy");
    await ctx.run(59);
    assert.equal(ctx.provider.said.length, 1);
    assert.equal(ctx.session.status.phase, "live");
    await ctx.run(1);
    assert.equal(ctx.provider.said.length, 2, "vuelve a preguntar después de otro minuto de silencio");
  });

  test("que el coach hable cuenta como actividad", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    for (let i = 0; i < 5; i++) {
      await ctx.run(50);
      ctx.provider.coachSpeaks();
    }
    assert.equal(ctx.provider.said.length, 0);
  });

  test("el audio de la app en silencio no cuenta como actividad", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    for (let i = 0; i < 60; i++) {
      ctx.session.handleClientMessage(Buffer.alloc(4800), true);
      await ctx.run(1);
    }
    assert.equal(ctx.provider.said.length, 1);
  });
});

describe("protección del costo", () => {
  test("la app no puede mandar audio mucho más rápido que el tiempo real", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    // 10 segundos de audio de golpe, sin que pase el tiempo.
    for (let i = 0; i < 100; i++) ctx.session.handleClientMessage(Buffer.alloc(PCM_SECOND / 10), true);
    const accepted = ctx.provider.audioFromUser.reduce((sum, c) => sum + c.byteLength, 0);
    assert.ok(accepted <= PCM_SECOND * 2, `aceptó ${accepted} bytes`);
  });

  test("audio en tiempo real sí se acepta completo", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    for (let i = 0; i < 100; i++) {
      ctx.session.handleClientMessage(Buffer.alloc(PCM_SECOND / 10), true);
      ctx.mono.advance(0.1);
    }
    const accepted = ctx.provider.audioFromUser.reduce((sum, c) => sum + c.byteLength, 0);
    assert.equal(accepted, PCM_SECOND * 10);
  });
});

describe("respaldo del consumo", () => {
  test("cada 10 s se descuenta lo medido, así un reinicio pierde como máximo 10 s", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    await ctx.run(25);
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, 20);
    assert.equal((await ctx.quota.getStatus(ctx.userId)).secondsRemaining, 7180);
  });

  test("si el respaldo falla, la charla sigue y se reintenta en el siguiente ciclo", async () => {
    const ctx = await setup();
    await ctx.session.start(ctx.socket);
    const original = ctx.store.chargeTalk.bind(ctx.store);
    let failing = true;
    ctx.store.chargeTalk = async (input) => {
      if (failing) throw new Error("base caída");
      return original(input);
    };
    await ctx.run(12);
    assert.equal(ctx.session.status.phase, "live");
    failing = false;
    await ctx.run(10);
    assert.equal(ctx.store.talks.get(ctx.talk.id)!.activeSeconds, 20);
  });
});
