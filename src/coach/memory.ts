import type { Language } from "../config.js";
import type { CoachStore, MemoryEntry } from "../store/types.js";
import { MAX_SUMMARIES } from "./context.js";
import type { Summarizer } from "./summarizer.js";

export interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Memoria interna del coach. Al cerrar cada charla se guarda un resumen que el coach recibe en la siguiente.
 * La transcripción se guarda solo hasta generar el resumen; después se borra (D13). Nada de esto sale por la API.
 */
export class CoachMemory {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly store: CoachStore,
    private readonly summarizer: Summarizer,
    private readonly log: Logger,
    private readonly language: Language = "es",
  ) {}

  /**
   * Resume las charlas cerradas que todavía no tienen resumen (la última, o las que fallaron antes).
   * Si el resumen falla, la transcripción queda guardada y se reintenta en la próxima charla.
   */
  async summarizePending(userId: string, options: { timeoutMs?: number; maxTalks?: number } = {}): Promise<number> {
    const deadline = Date.now() + (options.timeoutMs ?? 12_000);
    const pending = (await this.store.listPendingTranscripts(userId)).slice(0, options.maxTalks ?? 5);
    let saved = 0;
    for (const talk of pending) {
      if (this.inFlight.has(talk.talkId)) continue;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      this.inFlight.add(talk.talkId);
      try {
        // Una charla sin nada dicho no deja recuerdo.
        if (!talk.turns.some((turn) => turn.role === "user" && turn.text.trim())) {
          await this.store.clearTranscript(talk.talkId);
          continue;
        }
        const summary = await this.summarizer.summarize(
          { language: this.language, type: talk.type, startedAt: talk.startedAt, turns: talk.turns },
          { signal: AbortSignal.timeout(Math.min(15_000, remainingMs)) },
        );
        await this.store.saveSummary({ userId, talkId: talk.talkId, summary });
        saved += 1;
      } catch (error) {
        this.log.warn({ err: error instanceof Error ? error.message : String(error), talkId: talk.talkId }, "No se pudo resumir la charla; se reintenta en la próxima");
      } finally {
        this.inFlight.delete(talk.talkId);
      }
    }
    return saved;
  }

  recent(userId: string): Promise<MemoryEntry[]> {
    return this.store.recentSummaries(userId, MAX_SUMMARIES);
  }
}
