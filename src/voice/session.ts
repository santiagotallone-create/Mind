import { ClientControlMessageSchema, type ServerEvent } from "../contract/index.js";
import type { CoachMemory } from "../coach/memory.js";
import type { CoachToolRuntime } from "../coach/tools.js";
import { ActiveTimeMeter } from "../quota/meter.js";
import type { QuotaService } from "../quota/service.js";
import type { VoiceLimits } from "../server/env.js";
import type { DataStore, TalkRecord, TranscriptTurn } from "../store/types.js";
import type { SessionMetrics, VoiceProvider, VoiceSessionConfig } from "./provider.js";
import type { VoiceStrings } from "./strings.js";

type EndedEvent = Extract<ServerEvent, { type: "ended" }>;
export type EndReason = EndedEvent["reason"];

/** La conexión con la app. Una interfaz mínima para poder probar la sesión sin una red real. */
export interface ClientSocket {
  readonly isOpen: boolean;
  sendJson(event: ServerEvent): void;
  sendAudio(chunk: Buffer): void;
  close(): void;
}

export interface SessionLogger {
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface VoiceSessionDeps {
  userId: string;
  talk: TalkRecord;
  provider: VoiceProvider;
  /** Todo lo de la sesión del motor menos las herramientas, que se toman de `tools`. */
  providerConfig: Omit<VoiceSessionConfig, "tools">;
  tools: CoachToolRuntime;
  store: DataStore;
  quota: QuotaService;
  memory: CoachMemory;
  limits: VoiceLimits;
  strings: VoiceStrings;
  /** Reloj monótono en ms (el mismo que usa el medidor). */
  now: () => number;
  clock: () => Date;
  log: SessionLogger;
  onClosed: (talkId: string) => void;
}

type Phase = "starting" | "live" | "closing" | "closed";

const BYTES_PER_SECOND = 24_000 * 2; // PCM 16 bits mono 24 kHz
const MAX_TURN_CHARS = 2_000;
const MAX_TRANSCRIPT_CHARS = 100_000;

/**
 * Una charla en vivo: pausa, reanuda, se cierra, se reconecta tras un corte y mide el tiempo activo en el servidor.
 * Todas las reglas que dependen del tiempo se evalúan en `tick()`, que el servicio llama cada segundo:
 * así se prueban con un reloj falso, sin esperas reales.
 */
export class VoiceSession {
  readonly talkId: string;
  readonly userId: string;

  private phase: Phase = "starting";
  private socket: ClientSocket | null = null;
  private paused = false;
  private connected = true;
  private readonly meter: ActiveTimeMeter;

  private transcript: TranscriptTurn[] = [];
  private transcriptChars = 0;
  private transcriptDirty = false;

  private lastActivity = 0;
  private promptedAt: number | null = null;
  private pausedSince = 0;
  private disconnectedSince = 0;
  private farewell: { reason: "cuota_agotada" | "limite_duracion"; heardAudio: boolean; done: boolean } | null = null;
  private socketClosedWhileStarting = false;

  private periodId = "";
  private remainingBase = 0;
  private usedAtBase = 0;
  private lastFlush = 0;
  private flushing = false;

  private audioAllowance: number;
  private audioRefilledAt = 0;
  private providerStarted = false;
  private closePromise: Promise<void> | null = null;

  constructor(private readonly deps: VoiceSessionDeps) {
    this.talkId = deps.talk.id;
    this.userId = deps.userId;
    this.meter = new ActiveTimeMeter(deps.now);
    this.audioAllowance = this.audioCap;
  }

  /** Estado visible, para el servicio y las pruebas. */
  get status() {
    return { phase: this.phase, paused: this.paused, connected: this.connected, activeSeconds: this.meter.activeSeconds };
  }

  /** Se puede reconectar a esta charla. */
  get isLive(): boolean {
    return this.phase === "live";
  }

  async start(socket: ClientSocket): Promise<void> {
    this.socket = socket;
    try {
      await this.deps.provider.start(
        { ...this.deps.providerConfig, tools: this.deps.tools.definitions },
        {
          onAudio: (chunk) => this.onCoachAudio(chunk),
          onTranscript: (role, text) => this.onTranscript(role, text),
          onInterrupted: () => this.onUserSpeaking(),
          onError: (error) => this.onProviderError(error),
          onToolCall: (call) => this.deps.tools.handle(call),
          onResponseDone: () => this.onResponseDone(),
        },
      );
      this.providerStarted = true;

      // El bolsón se activa en el primer segundo activo, no al pedir el ticket.
      const period = await this.deps.quota.activate(this.userId);
      const remaining = period.secondsTotal - period.secondsUsed;
      this.periodId = period.id;
      this.remainingBase = remaining;
      this.usedAtBase = 0;
      if (remaining <= 0) {
        await this.close("cuota_agotada");
        return;
      }

      const now = this.deps.now();
      this.lastActivity = now;
      this.lastFlush = now;
      this.audioRefilledAt = now;
      this.phase = "live";
      this.meter.start();
      this.send({ type: "ready", talkId: this.talkId });
      // La app se fue mientras arrancaba: es un corte como cualquier otro.
      if (this.socketClosedWhileStarting || !this.socket?.isOpen) this.markDisconnected();
    } catch (error) {
      this.deps.log.error({ err: errorMessage(error), talkId: this.talkId }, "No se pudo abrir la charla");
      this.send({ type: "error", code: "start_failed", retryable: true });
      await this.close("error");
    }
  }

  /** La app reconectó tras un corte: se retoma la misma charla con la misma sesión del motor. */
  attach(socket: ClientSocket): boolean {
    if (this.phase !== "live") return false;
    const previous = this.socket;
    this.socket = socket;
    if (previous && previous !== socket) previous.close();
    if (!this.connected) {
      this.connected = true;
      this.meter.reconnect();
    }
    this.promptedAt = null;
    this.touch();
    this.send({ type: "ready", talkId: this.talkId });
    if (this.paused) this.send({ type: "paused" });
    return true;
  }

  handleSocketClosed(socket: ClientSocket): void {
    if (socket !== this.socket) return; // un socket viejo que ya se reemplazó
    this.socket = null;
    if (this.phase === "starting") this.socketClosedWhileStarting = true;
    else this.markDisconnected();
  }

  private markDisconnected(): void {
    if (this.phase !== "live" || !this.connected) return;
    this.connected = false;
    this.meter.disconnect();
    this.disconnectedSince = this.deps.now();
    // Lo que el coach siga diciendo no lo va a oír nadie.
    this.deps.provider.interrupt();
  }

  handleClientMessage(data: Buffer, isBinary: boolean): void {
    if (this.phase !== "live") return;
    if (isBinary) {
      if (this.paused || !this.connected) return;
      if (!this.takeAudioBudget(data.byteLength)) return;
      this.deps.provider.sendAudio(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString("utf-8"));
    } catch {
      parsed = null;
    }
    const message = ClientControlMessageSchema.safeParse(parsed);
    if (!message.success) {
      this.send({ type: "error", code: "invalid_message", retryable: false });
      return;
    }
    switch (message.data.type) {
      case "pause":
        this.pause();
        break;
      case "resume":
        this.resume();
        break;
      case "end":
        void this.close("usuario");
        break;
    }
  }

  /** Evalúa las reglas que dependen del tiempo. Lo llama el servicio una vez por segundo. */
  async tick(): Promise<void> {
    if (this.phase !== "live") return;
    const t = this.deps.now();
    const limits = this.deps.limits;

    if (this.paused && t - this.pausedSince >= limits.pauseMaxSeconds * 1000) return this.close("inactividad");
    if (!this.connected && t - this.disconnectedSince >= limits.reconnectGraceSeconds * 1000) return this.close("corte");
    if (t - this.lastFlush >= limits.heartbeatSeconds * 1000) await this.flush();
    if (this.phase !== "live" || !this.meter.isRunning) return;

    const used = this.meter.activeSeconds;
    const remaining = this.remainingBase - (used - this.usedAtBase);
    const untilLimit = limits.maxTalkSeconds - used;

    // Despedida: el coach se despide cuando quedan pocos segundos, y la charla se corta en cero (con un margen que no se descuenta).
    if (!this.farewell) {
      if (remaining <= limits.farewellWarningSeconds) this.startFarewell("cuota_agotada", this.deps.strings.farewellQuota);
      else if (untilLimit <= limits.farewellWarningSeconds) this.startFarewell("limite_duracion", this.deps.strings.farewellLimit);
    }
    if (this.farewell) {
      const left = this.farewell.reason === "cuota_agotada" ? remaining : untilLimit;
      if ((left <= 0 && this.farewell.done) || left <= -limits.farewellMarginSeconds) return this.close(this.farewell.reason);
      return; // durante la despedida no se aplica la regla de inactividad
    }

    // Inactividad: a los 60 s sin que nadie hable el coach pregunta si sigue ahí; a los 20 s más sin respuesta se cierra.
    if (this.promptedAt === null) {
      if (t - this.lastActivity >= limits.inactivityPromptSeconds * 1000) {
        this.promptedAt = t;
        this.deps.provider.interrupt();
        this.deps.provider.say(this.deps.strings.inactivityPrompt);
      }
    } else if (t - Math.max(this.lastActivity, this.promptedAt) >= limits.inactivityCloseSeconds * 1000) {
      return this.close("inactividad");
    }
  }

  /** Cierra la charla (una sola vez): descuenta, guarda, avisa a la app y genera el resumen para la próxima. */
  close(reason: EndReason): Promise<void> {
    this.closePromise ??= this.doClose(reason);
    return this.closePromise;
  }

  private async doClose(reason: EndReason): Promise<void> {
    this.phase = "closing";
    this.meter.stop();
    const activeSeconds = this.meter.activeSeconds;
    const { store, quota, log } = this.deps;

    try {
      if (this.periodId) await quota.chargeTalk({ talkId: this.talkId, periodId: this.periodId, activeSeconds });
    } catch (error) {
      log.error({ err: errorMessage(error), talkId: this.talkId }, "No se pudo descontar el tiempo final");
    }

    let providerMetrics: SessionMetrics | undefined;
    if (this.providerStarted) {
      try {
        providerMetrics = await this.deps.provider.close();
      } catch (error) {
        log.warn({ err: errorMessage(error) }, "No se pudo cerrar la sesión del motor de voz");
      }
    }

    try {
      if (this.transcript.length > 0) await store.saveTranscript(this.talkId, this.transcript);
      await store.closeTalk(this.talkId, {
        endedAt: this.deps.clock(),
        endReason: reason,
        metrics: { ...providerMetrics, activeSeconds },
      });
    } catch (error) {
      log.error({ err: errorMessage(error), talkId: this.talkId }, "No se pudo guardar el cierre de la charla");
    }

    this.send({ type: "ended", reason });

    // El resumen se hace con la conexión todavía abierta: si el servidor suspende el trabajo en segundo plano, no se pierde.
    try {
      await this.deps.memory.summarizePending(this.userId, { timeoutMs: 10_000 });
    } catch (error) {
      log.warn({ err: errorMessage(error) }, "No se pudo generar el resumen");
    }

    this.socket?.close();
    this.socket = null;
    this.phase = "closed";
    this.deps.onClosed(this.talkId);
  }

  // --- Pausa ---

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedSince = this.deps.now();
    this.meter.pause();
    this.deps.provider.interrupt();
    this.send({ type: "paused" });
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.meter.resume();
    this.promptedAt = null;
    this.touch();
    this.send({ type: "resumed" });
  }

  // --- Eventos del motor de voz ---

  private onCoachAudio(chunk: ArrayBuffer): void {
    if (this.phase !== "live" || this.paused || !this.connected) return;
    if (this.farewell) this.farewell.heardAudio = true;
    this.touch();
    this.socket?.sendAudio(Buffer.from(chunk));
  }

  private onTranscript(role: "user" | "coach", text: string): void {
    const clean = text.trim();
    if (!clean || this.phase === "closed") return;
    if (role === "user") this.markUserActive();
    else this.touch();
    const turn: TranscriptTurn = { role, text: clean.slice(0, MAX_TURN_CHARS), at: this.deps.clock().toISOString() };
    if (this.transcriptChars + turn.text.length <= MAX_TRANSCRIPT_CHARS) {
      this.transcript.push(turn);
      this.transcriptChars += turn.text.length;
      this.transcriptDirty = true;
    }
    this.send({ type: "transcript", role, text: turn.text });
  }

  private markUserActive(): void {
    this.promptedAt = null;
    this.touch();
  }

  /** La persona empezó a hablar: la app corta el audio del coach que esté reproduciendo. */
  private onUserSpeaking(): void {
    this.markUserActive();
    if (this.phase === "live" && this.connected) this.send({ type: "interrupted" });
  }

  /** La despedida termina cuando el coach, tras empezar a hablar, completa su respuesta (la respuesta cancelada de antes no cuenta). */
  private onResponseDone(): void {
    if (this.farewell?.heardAudio) this.farewell.done = true;
  }

  private onProviderError(error: Error): void {
    this.deps.log.error({ err: error.message, talkId: this.talkId }, "Error del motor de voz");
    if (this.phase === "closing" || this.phase === "closed") return;
    this.send({ type: "error", code: "provider_error", retryable: false });
    void this.close("error");
  }

  // --- Auxiliares ---

  private startFarewell(reason: "cuota_agotada" | "limite_duracion", instruction: string): void {
    this.farewell = { reason, heardAudio: false, done: false };
    this.deps.provider.interrupt();
    this.deps.provider.say(instruction);
  }

  private touch(): void {
    this.lastActivity = this.deps.now();
  }

  private send(event: ServerEvent): void {
    if (this.socket?.isOpen) this.socket.sendJson(event);
  }

  /** Respalda el consumo y la transcripción. Si falla se reintenta en el próximo ciclo. */
  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.lastFlush = this.deps.now();
    try {
      const used = this.meter.activeSeconds;
      const result = await this.deps.quota.chargeTalk({ talkId: this.talkId, periodId: this.periodId, activeSeconds: used });
      // Se toma el menor: si otra charla gastó del mismo periodo, el saldo real manda.
      this.remainingBase = Math.min(this.remainingBase - (used - this.usedAtBase), result.secondsRemaining);
      this.usedAtBase = used;
      if (this.transcriptDirty) {
        this.transcriptDirty = false;
        await this.deps.store.saveTranscript(this.talkId, this.transcript);
      }
    } catch (error) {
      this.transcriptDirty = true;
      this.deps.log.warn({ err: errorMessage(error), talkId: this.talkId }, "No se pudo respaldar el consumo; se reintenta");
    } finally {
      this.flushing = false;
    }
  }

  private get audioCap(): number {
    return BYTES_PER_SECOND * 2; // hasta dos segundos de audio de una vez
  }

  /** La app no puede mandar audio mucho más rápido que el tiempo real: sería gastar voz sin que corra el reloj. */
  private takeAudioBudget(bytes: number): boolean {
    const now = this.deps.now();
    const elapsed = Math.max(0, now - this.audioRefilledAt) / 1000;
    this.audioRefilledAt = now;
    this.audioAllowance = Math.min(this.audioCap, this.audioAllowance + elapsed * BYTES_PER_SECOND * this.deps.limits.maxInboundAudioRate);
    if (bytes > this.audioAllowance) return false;
    this.audioAllowance -= bytes;
    return true;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
