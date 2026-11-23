import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { WebSocketServer, type WebSocket } from "ws";
import { OpenAIRealtimeProvider } from "./openai-realtime.js";
import type { VoiceProviderEvents } from "./provider.js";

/**
 * Servidor local que imita lo que el servicio de voz enviaría, para comprobar que el adaptador
 * manda y entiende los mensajes que nosotros esperamos. No valida contra OpenAI real.
 */
describe("proveedor OpenAI Realtime contra un servidor local", () => {
  let server: WebSocketServer;
  let peer: WebSocket;
  let received: any[];
  let connectedUrl = "";
  const previous = { key: process.env.OPENAI_API_KEY, url: process.env.OPENAI_REALTIME_URL };

  before(async () => {
    server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_REALTIME_URL = `ws://127.0.0.1:${(server.address() as { port: number }).port}`;
    server.on("connection", (socket, request) => {
      peer = socket;
      connectedUrl = request.url ?? "";
      socket.on("message", (data) => received.push(JSON.parse(data.toString())));
    });
  });
  after(() => {
    server.close();
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
    if (previous.url === undefined) delete process.env.OPENAI_REALTIME_URL;
    else process.env.OPENAI_REALTIME_URL = previous.url;
  });
  afterEach(() => {
    received = [];
  });

  const events = () => {
    const log = { audio: [] as ArrayBuffer[], transcripts: [] as [string, string][], interrupted: 0, done: 0, errors: [] as Error[], tools: [] as any[] };
    const handlers: VoiceProviderEvents = {
      onAudio: (chunk) => log.audio.push(chunk),
      onTranscript: (role, text) => log.transcripts.push([role, text]),
      onInterrupted: () => log.interrupted++,
      onResponseDone: () => log.done++,
      onError: (error) => log.errors.push(error),
      onToolCall: async (call) => (log.tools.push(call), { ok: true, velocidad_actual: 0.9 }),
    };
    return { log, handlers };
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

  async function open() {
    received = [];
    const provider = new OpenAIRealtimeProvider();
    const { log, handlers } = events();
    await provider.start(
      {
        language: "es",
        speed: 0.9,
        instructions: "Eres un coach",
        tools: [{ name: "ajustar_velocidad", description: "Cambia la velocidad", parameters: { type: "object" } }],
      },
      handlers,
    );
    await settle();
    return { provider, log };
  }

  test("al abrir manda la configuración: instrucciones, herramientas, formato de audio y velocidad", async () => {
    const { provider } = await open();
    assert.ok(connectedUrl.startsWith("/?model="));
    const update = received.find((m) => m.type === "session.update");
    assert.ok(update.session.instructions.startsWith("Eres un coach"));
    assert.deepEqual(update.session.tools.map((t: any) => [t.type, t.name]), [["function", "ajustar_velocidad"]]);
    assert.equal(update.session.audio.output.speed, 0.9);
    assert.deepEqual(update.session.audio.input.format, { type: "audio/pcm", rate: 24000 });
    await provider.close();
  });

  test("audio del usuario hacia el servicio y audio del coach hacia el sistema, en base64", async () => {
    const { provider, log } = await open();
    provider.sendAudio(new Uint8Array([1, 2, 3]).buffer);
    peer.send(JSON.stringify({ type: "response.output_audio.delta", delta: Buffer.from([9, 8, 7]).toString("base64") }));
    await settle();
    assert.equal(received.find((m) => m.type === "input_audio_buffer.append").audio, Buffer.from([1, 2, 3]).toString("base64"));
    assert.deepEqual([...new Uint8Array(log.audio[0]!)], [9, 8, 7]);
    await provider.close();
  });

  test("transcripciones, interrupción y fin de respuesta llegan como eventos", async () => {
    const { provider, log } = await open();
    peer.send(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
    peer.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "Hola" }));
    peer.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: "Bienvenido" }));
    peer.send(JSON.stringify({ type: "response.done", response: { output: [] } }));
    await settle();
    assert.equal(log.interrupted, 1);
    assert.deepEqual(log.transcripts, [["user", "Hola"], ["coach", "Bienvenido"]]);
    assert.equal(log.done, 1);
    await provider.close();
  });

  test("una llamada a herramienta se ejecuta y el resultado vuelve al coach, que sigue hablando", async () => {
    const { provider, log } = await open();
    peer.send(
      JSON.stringify({
        type: "response.done",
        response: { output: [{ type: "function_call", name: "ajustar_velocidad", call_id: "c1", arguments: '{"velocidad":0.9}' }] },
      }),
    );
    await settle();
    assert.deepEqual(log.tools, [{ name: "ajustar_velocidad", arguments: '{"velocidad":0.9}' }]);
    const output = received.find((m) => m.type === "conversation.item.create");
    assert.equal(output.item.call_id, "c1");
    assert.deepEqual(JSON.parse(output.item.output), { ok: true, velocidad_actual: 0.9 });
    assert.ok(received.some((m) => m.type === "response.create"));
    await provider.close();
  });

  test("say() pide una respuesta con instrucciones; setSpeed() cambia la velocidad; interrupt() cancela", async () => {
    const { provider } = await open();
    provider.say("Pregunta si sigue ahí");
    provider.setSpeed(0.8);
    provider.interrupt();
    await settle();
    assert.equal(received.find((m) => m.type === "response.create").response.instructions, "Pregunta si sigue ahí");
    assert.equal(received.find((m) => m.type === "session.update" && m.session.audio?.output?.speed === 0.8) !== undefined, true);
    assert.ok(received.some((m) => m.type === "response.cancel"));
    await provider.close();
  });

  test("un error del servicio llega como evento, salvo cancelar sin respuesta en curso", async () => {
    const { provider, log } = await open();
    peer.send(JSON.stringify({ type: "error", error: { message: "Cancellation failed: no active response found" } }));
    peer.send(JSON.stringify({ type: "error", error: { message: "Cuota agotada en el proveedor" } }));
    await settle();
    assert.deepEqual(log.errors.map((e) => e.message), ["Cuota agotada en el proveedor"]);
    await provider.close();
  });

  test("sin OPENAI_API_KEY no conecta", async () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await assert.rejects(new OpenAIRealtimeProvider().start({ language: "es", instructions: "x" }, events().handlers), /OPENAI_API_KEY/);
    } finally {
      process.env.OPENAI_API_KEY = key;
    }
  });
});
