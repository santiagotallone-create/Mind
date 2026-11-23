# Mind

Coach de mindfulness con voz e IA. Estado actual: prueba de concepto y fundaciones del MVP (Ola 1).

## Historias de la PoC
1. Conversación en vivo con el coach en español (issue #1).
2. Generación de meditaciones guiadas con voz sintetizada (issue #2).

## Estructura
- `src/voice/`: interfaz `VoiceProvider` y motores de voz intercambiables.
- `src/coach/prompts/`: personalidad del coach, un archivo por idioma.
- `src/poc/`: servidor local y página con micrófono para probar la conversación.
- `src/meditation/`: convierte un guion en audio con silencios exactos (historia 2).
- `meditaciones/`: guiones de meditación, uno por archivo.
- `src/metrics/`: registro de latencia y costo.
- `src/config.ts`: idioma y motor activos.
- `docs/decisiones.md`: decisiones técnicas.
- `docs/arquitectura.md`, `docs/api.md`, `docs/despliegue.md`: arquitectura del MVP, contrato de API y despliegue gratuito.
- `src/contract/`: esquemas de la API compartidos por frontend y backend.
- `src/server/`: servidor del MVP (Fastify): autenticación, límites de uso y rutas.
- `src/quota/`: bolsón de coaching (periodos, servicio y medidor de tiempo activo).
- `src/store/`: acceso a datos (Supabase y versión en memoria para pruebas).
- `supabase/migrations/`: modelo de datos.

## Probar la conversación (historia 1)
```
git pull
npm install
# Solo la primera vez (si ya tienes .env, NO repitas esto: lo sobrescribe): cp .env.example .env
npm run poc
```
Luego abre http://localhost:3000 en Chrome, pulsa "Empezar", permite el micrófono y habla en español. Usa auriculares. Al pulsar "Terminar" ves la latencia y los tokens consumidos.

El costo se calcula solo con los precios de `src/voice/pricing.ts` (verificados el 2026-11-02; revísalos de vez en cuando). Para probar el modelo económico, agrega `OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini` en `.env`.

## Generar una meditación (historia 2)
```
npm run meditacion -- respiracion-5min --simular   # prueba gratis: tonos en vez de voz, para ver duración y silencios
npm run meditacion -- respiracion-5min             # con voz real (usa OPENAI_API_KEY)
```
El audio queda en `salida/respiracion-5min.wav`, junto con un `.json` con duraciones y costo. Los audios ya generados se guardan en `salida/cache/`: si solo cambias las pausas del guion, no se vuelve a pagar la voz.

Formato del guion (`meditaciones/*.md`): una cabecera opcional entre `---` (titulo, voz, velocidad, instrucciones), una línea de texto por bloque, `[pausa N]` para N segundos de silencio exacto, y `#` para comentarios.

Variables opcionales en `.env`: `TTS_VOICE` (por defecto `marin`), `TTS_SPEED` (1 = normal) y `TTS_MODEL` (por defecto `gpt-4o-mini-tts`).

## Desarrollo del MVP
```
npm install
npm run typecheck
npm test
npm run dev:server   # servidor en http://localhost:8080 (necesita .env)
```
