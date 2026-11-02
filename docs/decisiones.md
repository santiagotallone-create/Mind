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

## 2026-11-02 (medición de costo y latencia)
- **Costo por modelo:** los precios de `gpt-realtime-2.1` y `gpt-realtime-2.1-mini` viven en `src/voice/pricing.ts` (verificados el 2026-11-02 en la documentación de OpenAI). Reemplazan a las variables `OPENAI_PRICE_*`.
- **Desglose de tokens:** se separan audio y texto, con y sin caché, para calcular el costo real. Si el servicio no entrega el detalle, el costo se marca como cota máxima. El primer `usage` recibido se imprime en la consola del servidor para validar su forma real.
- **Latencia percibida:** la latencia del motor se mide desde que detecta el fin de la frase, que ocurre tras el silencio configurado. Se muestra también la espera aproximada que siente el usuario (latencia más silencio).
- **Primera medición (sesión de 846 s con `gpt-realtime-2.1`):** latencia del motor promedio de 857 ms; 66 746 tokens de entrada y 12 945 de salida. Sin desglose, el costo máximo estimado es de unos 3 USD (unos 0,21 USD/min), por encima del tope mensual si se usara 120 min/mes con el modelo grande. Con el modelo mini el máximo sería de unos 0,93 USD en esa sesión. El costo real hay que contrastarlo con la sección de uso de la cuenta de OpenAI.
- **No incluido:** el costo de transcribir lo que dice el usuario (`gpt-4o-mini-transcribe`) se factura aparte y no se suma al estimado.

## 2026-11-02 (velocidad de la voz)
- **Hallazgo:** el coach no cambiaba su velocidad al pedírselo. Causa: la velocidad es un parámetro de la sesión (`audio.output.speed`, de 0.25 a 1.5, con valor 1 por defecto) que se aplica después de generar el audio, y el modelo no lo controla por sí solo. Solo puede cambiar entre turnos.
- **Solución en dos niveles:** velocidad inicial configurable con `VOICE_SPEED` en `.env`, y herramienta `ajustar_velocidad` que el coach llama cuando la persona pide hablar más lento o más rápido. El motor aplica el cambio con `session.update` y el coach confirma de viva voz. El rango se limita a 0.5-1.5.
- **Pendiente de validar en uso real:** el flujo de la herramienta (llamada, resultado y nueva respuesta) sigue la documentación, pero no se pudo probar contra el servicio.
- **Nota de arquitectura:** la herramienta es específica de este motor. En el motor de cadena, la velocidad será un parámetro de la síntesis de voz, y la historia 2 también la necesitará para las meditaciones.

## 2026-11-02 (comparación de modelos y cierre de la historia 1)
- **Modelo grande (`gpt-realtime-2.1`), sesión de 2,0 min:** 0,2314 USD, unos 0,114 USD/min, proyección de 13,65 USD al mes por 120 min. Latencia del motor de 641 ms.
- **Modelo mini (`gpt-realtime-2.1-mini`), sesión de 2,1 min:** 0,0792 USD, unos 0,038 USD/min, proyección de 4,60 USD al mes por 120 min. Latencia del motor de 652 ms. Calidad de conversación valorada como suficiente.
- **Decisión:** el modelo por defecto pasa a ser el mini. Cabe en el tope mensual de 10 euros con margen, sin diferencia de latencia y con calidad aceptable. El modelo grande queda disponible con `OPENAI_REALTIME_MODEL`.
- **Reservas:** las sesiones de prueba son cortas (2 min). El costo por minuto puede subir en charlas largas, porque el contexto crece, y la transcripción de lo que dice el usuario se factura aparte. Falta contrastar con la sección de uso de la cuenta de OpenAI y medir una charla de unos 10 min.
