import type {
  SessionMetrics,
  VoiceProvider,
  VoiceProviderEvents,
  VoiceSessionConfig,
} from "./provider.js";

/**
 * Motor 1: servicio de voz de extremo a extremo (OpenAI Realtime).
 * Esqueleto: la conexión se implementa en la historia PoC 1.
 */
export class OpenAIRealtimeProvider implements VoiceProvider {
  async start(_config: VoiceSessionConfig, _events: VoiceProviderEvents): Promise<void> {
    throw new Error("Pendiente de implementar (historia PoC 1)");
  }

  sendAudio(_chunk: ArrayBuffer): void {
    throw new Error("Pendiente de implementar (historia PoC 1)");
  }

  interrupt(): void {
    throw new Error("Pendiente de implementar (historia PoC 1)");
  }

  async close(): Promise<SessionMetrics> {
    throw new Error("Pendiente de implementar (historia PoC 1)");
  }
}
