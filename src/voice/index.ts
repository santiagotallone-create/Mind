import type { ProviderName } from "../config.js";
import { ChainProvider } from "./chain.js";
import { OpenAIRealtimeProvider } from "./openai-realtime.js";
import type { VoiceProvider } from "./provider.js";

/** Único lugar donde se elige el motor. El resto del sistema usa VoiceProvider. */
export function createVoiceProvider(name: ProviderName): VoiceProvider {
  switch (name) {
    case "openai-realtime":
      return new OpenAIRealtimeProvider();
    case "chain":
      return new ChainProvider();
  }
}
