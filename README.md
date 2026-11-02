# Mind

Coach de mindfulness con voz e IA. Estado actual: prueba de concepto.

## Historias de la PoC
1. Conversación en vivo con el coach en español (issue #1).
2. Generación de meditaciones guiadas con voz sintetizada (issue #2).

## Estructura
- `src/voice/`: interfaz `VoiceProvider` y motores de voz intercambiables.
- `src/coach/prompts/`: personalidad del coach, un archivo por idioma.
- `src/metrics/`: registro de latencia y costo.
- `src/config.ts`: idioma y motor activos.
- `docs/decisiones.md`: decisiones técnicas.

## Puesta en marcha
```
npm install
cp .env.example .env   # y completa OPENAI_API_KEY
npm run typecheck
```
