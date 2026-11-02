# Registro de decisiones técnicas

## 2026-11-02
- **Motor de voz de la PoC:** OpenAI Realtime (extremo a extremo). Motivo: menor latencia, interrupciones y una sola conexión; prioridad en la naturalidad.
- **Motores intercambiables:** el proveedor vive detrás de la interfaz `VoiceProvider` (`src/voice/provider.ts`). El segundo motor (cadena de reconocimiento, Claude y síntesis) queda como esqueleto.
- **Lenguaje:** TypeScript. Motivo: mismo lenguaje para la página de prueba y para las futuras funciones de Supabase.
- **Idioma configurable:** prompt, voz y reconocimiento se definen por idioma en `src/config.ts` y `src/coach/prompts/`. El MVP sale solo en español; el italiano se suma sin cambiar código.
- **Costos de referencia:** conversación en vivo entre 2 y 13 euros al mes para 120 minutos, según el modelo. Las meditaciones no usan el sistema en vivo: se generan por lotes (texto a audio).

## 2026-11-02 (implementación de la historia 1)
- **Conexión:** el navegador envía el audio del micrófono por WebSocket a un servidor local, y este se conecta a OpenAI Realtime. Motivo: la clave de API nunca llega al navegador y el motor sigue siendo intercambiable detrás de `VoiceProvider` (con conexión directa del navegador no cabría en la interfaz).
- **Formato de audio:** PCM 16 bits, mono, 24 kHz en ambos sentidos.
- **Interrupciones:** se agregó el evento opcional `onInterrupted` a `VoiceProviderEvents`. El motor avisa cuando el usuario empieza a hablar y la página corta el audio del coach.
- **Detección de turnos:** `semantic_vad` del servicio.
- **Costos:** el costo solo se estima si se configuran los precios en `.env`; si no, se registran los tokens. Modelo configurable con `OPENAI_REALTIME_MODEL`.
- **Pendiente de validar en uso real:** nombres de eventos y parámetros según la documentación consultada hoy; no se pudo probar contra el servicio sin la clave.

## 2026-11-02 (hallazgos de la primera prueba)
- **Hallazgo 1, cortes intermitentes:** el coach se cortaba solo mientras hablaba. Causa probable: falsos positivos de la detección de turnos (eco o ruido tomados como interrupción). Acción: la detección pasa a modo `server` con umbral 0.75 y 1500 ms de silencio, y es configurable desde `.env` (`VOICE_TURN_*`) sin tocar el código. Recomendación: usar auriculares.
- **Hallazgo 2, silencios:** el motor en vivo no sostiene silencios de varios segundos entre frases, ni del coach ni del usuario. Es una limitación del tipo de motor, pensado para conversar con fluidez. Decisión: los silencios de la meditación guiada no se resuelven con este motor. Se cubren en la historia 2: guion con pausas marcadas y audio armado por lotes insertando silencios de duración exacta.
- **Hallazgo 3, ritmo y calidad:** el sonido y el ritmo del habla resultan aceptables en español. La voz concreta y el tono se definen en una fase posterior.
- **Efecto sobre la arquitectura:** confirma la separación entre conversación en vivo (historia 1) y meditaciones pregeneradas (historia 2).
