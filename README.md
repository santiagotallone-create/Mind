# Mind

Coach de mindfulness con voz e IA. Estado actual: prueba de concepto.

## Historias de la PoC
1. Conversación en vivo con el coach en español (issue #1).
2. Generación de meditaciones guiadas con voz sintetizada (issue #2).

## Estructura
- `src/voice/`: interfaz `VoiceProvider` y motores de voz intercambiables.
- `src/coach/prompts/`: personalidad del coach, un archivo por idioma.
- `src/poc/`: servidor local y página con micrófono para probar la conversación.
- `src/metrics/`: registro de latencia y costo.
- `src/config.ts`: idioma y motor activos.
- `docs/decisiones.md`: decisiones técnicas.

## Probar la conversación (historia 1)
```
git pull
npm install
cp .env.example .env   # y completa OPENAI_API_KEY (ya hecho si seguiste los pasos)
npm run poc
```
Luego abre http://localhost:3000 en Chrome, pulsa "Empezar", permite el micrófono y habla en español. Usa auriculares. Al pulsar "Terminar" ves la latencia y los tokens consumidos.

Para estimar el costo, completa en `.env` los precios actuales (`OPENAI_PRICE_IN_PER_M` y `OPENAI_PRICE_OUT_PER_M`).
