import type {
  SessionMetrics,
  VoiceProvider,
  VoiceProviderEvents,
  VoiceSessionConfig,
} from "./provider.js";

/**
 * Motor 2: cadena de reconocimiento de voz, modelo (Claude) y síntesis de voz.
 * Solo interfaz preparada: no se implementa en la prueba de concepto.
 */
export class ChainProvider implements VoiceProvider {
  async start(_config: VoiceSessionConfig, _events: VoiceProviderEvents): Promise<void> {
    throw new Error("Motor no implementado en la prueba de concepto");
  }

  sendAudio(_chunk: ArrayBuffer): void {
    throw new Error("Motor no implementado en la prueba de concepto");
  }

  interrupt(): void {
    throw new Error("Motor no implementado en la prueba de concepto");
  }

  async close(): Promise<SessionMetrics> {
    throw new Error("Motor no implementado en la prueba de concepto");
  }
}
