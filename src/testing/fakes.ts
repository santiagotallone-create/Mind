import type { ServerEvent } from "../contract/index.js";
import type { Summarizer, SummarizeInput } from "../coach/summarizer.js";
import type { SessionMetrics, VoiceProvider, VoiceProviderEvents, VoiceSessionConfig } from "../voice/provider.js";
import type { ClientSocket } from "../voice/session.js";

/** Motor de voz falso: registra lo que recibe y deja que la prueba emita lo que haría el proveedor. */
export class FakeProvider implements VoiceProvider {
  events!: VoiceProviderEvents;
  config?: VoiceSessionConfig;
  started = false;
  closed = false;
  failOnStart = false;
  audioFromUser: ArrayBuffer[] = [];
  said: string[] = [];
  interrupts = 0;
  speeds: number[] = [];

  async start(config: VoiceSessionConfig, events: VoiceProviderEvents): Promise<void> {
    if (this.failOnStart) throw new Error("no se pudo conectar");
    this.config = config;
    this.events = events;
    this.started = true;
  }
  sendAudio(chunk: ArrayBuffer): void {
    this.audioFromUser.push(chunk);
  }
  interrupt(): void {
    this.interrupts += 1;
  }
  say(instruction: string): void {
    this.said.push(instruction);
  }
  setSpeed(speed: number): void {
    this.speeds.push(speed);
  }
  async close(): Promise<SessionMetrics> {
    this.closed = true;
    return { durationSeconds: 1, responseLatenciesMs: [640], model: "fake-mini", estimatedCostUsd: 0.01, costIsUpperBound: false };
  }

  // Lo que haría el proveedor:
  coachSpeaks(bytes = 960): void {
    this.events.onAudio(new Uint8Array(bytes).buffer);
  }
  coachFinishesResponse(): void {
    this.events.onResponseDone?.();
  }
  userSpeaks(text?: string): void {
    this.events.onInterrupted?.();
    if (text) this.events.onTranscript("user", text);
  }
  coachSays(text: string): void {
    this.events.onTranscript("coach", text);
  }
  callTool(name: string, args: unknown): Promise<unknown> {
    return this.events.onToolCall!({ name, arguments: JSON.stringify(args) });
  }
  fail(message = "fallo del proveedor"): void {
    this.events.onError(new Error(message));
  }
}

/** La conexión con la app, falsa: guarda lo que el servidor le manda. */
export class FakeSocket implements ClientSocket {
  isOpen = true;
  events: ServerEvent[] = [];
  audio: Buffer[] = [];
  closeCount = 0;

  sendJson(event: ServerEvent): void {
    if (this.isOpen) this.events.push(event);
  }
  sendAudio(chunk: Buffer): void {
    if (this.isOpen) this.audio.push(chunk);
  }
  close(): void {
    this.isOpen = false;
    this.closeCount += 1;
  }
  get types(): string[] {
    return this.events.map((e) => e.type);
  }
  lastOf<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    return [...this.events].reverse().find((e) => e.type === type) as Extract<ServerEvent, { type: T }> | undefined;
  }
}

/** Resumidor falso: devuelve un resumen fijo y anota qué le pidieron. */
export class FakeSummarizer implements Summarizer {
  calls: SummarizeInput[] = [];
  fail = false;
  async summarize(input: SummarizeInput): Promise<string> {
    this.calls.push(input);
    if (this.fail) throw new Error("el servicio de resumen no responde");
    return `Resumen de ${input.turns.length} turnos.`;
  }
}

export const silentLog = { warn() {}, error() {} };
