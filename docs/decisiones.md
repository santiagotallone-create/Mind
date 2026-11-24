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

## 2026-11-02 (validación de la velocidad)
- **Validado en uso real:** el coach baja la velocidad al pedírselo en plena charla (herramienta `ajustar_velocidad`). Historia 1 cerrada.
- **Seguimientos pendientes:** contrastar el costo con la sección de uso de la cuenta de OpenAI y medir una charla de unos 10 minutos con el modelo mini.

## 2026-11-03 (historia 2: meditaciones con voz sintética)
- **Guiones escritos por Claude en el chat, no por una API.** Para el MVP los guiones se escriben en la conversación y se guardan en `meditaciones/`. La suscripción personal no sirve para que una app llame a Claude por su cuenta; eso requeriría la API de Anthropic, con otra clave y facturación. La generación automática de guiones queda fuera de esta prueba; cuando haga falta, se agrega detrás de una interfaz propia, como la voz.
- **Flujo:** `npm run meditacion -- <guion>` lee el guion, convierte cada bloque de texto en audio, une los bloques con silencios generados por el programa y guarda un WAV con su informe (`salida/`). Es manual por ahora; la misma pieza se podrá llamar desde un servidor cuando exista la app.
- **Silencios exactos:** las pausas `[pausa N]` las inserta el programa como muestras en cero, no el servicio de voz (que no sostiene silencios largos, ver hallazgo 2 de la historia 1). Verificado con pruebas: una pausa de 4 s son exactamente 96 000 muestras a 24 kHz.
- **Servicio de voz detrás de `SpeechProvider`** (`src/meditation/speech.ts`). Implementaciones: OpenAI TTS (`gpt-4o-mini-tts`) y una voz simulada para probar estructura sin clave ni costo.
- **Aviso importante, modelos de voz en retirada:** según la documentación de OpenAI consultada el 2026-11-03, `tts-1`, `tts-1-hd` y `gpt-4o-mini-tts` dejan de funcionar el **2027-01-06**, y se recomienda migrar a `gpt-realtime-2.1-mini` por la API Realtime. Se usa `gpt-4o-mini-tts` para esta prueba porque es el camino más simple y barato para evaluar voz y silencios, pero no sirve como base definitiva. Pendiente: evaluar el reemplazo (Realtime en modo texto a audio, u otro servicio como ElevenLabs, Google o Azure).
- **Formato de audio:** se pide WAV y se lee su cabecera (frecuencia, canales) en lugar de suponer el formato del PCM, que la documentación no especifica.
- **Costos:** precios por token verificados el 2026-11-03: texto de entrada 0,60 USD por millón y audio de salida 12 USD por millón. La documentación no da la equivalencia en minutos, así que el programa muestra una referencia aproximada de 0,015 USD por minuto de audio, marcada como no verificada; el dato real está en la sección de uso de la cuenta de OpenAI.
- **Caché de audios:** cada bloque de voz se guarda por texto, voz, velocidad e instrucciones. Cambiar solo las pausas no vuelve a pagar la voz.
- **Idioma:** el guion es un archivo por idioma. El italiano se suma con otro guion, sin tocar el código.
- **Primer guion:** `respiracion-5min.md`, de 5 minutos, con unos 2 min 08 s de voz y 2 min 52 s de silencio (estimado con la voz simulada; la duración real de la voz puede variar).

## 2026-11-23 (historia #3: arquitectura, stack y modelo de datos)
Detalle en `docs/arquitectura.md` y `docs/api.md`.
- **Plataforma (D1, decidida por Santi):** web app instalable (PWA) para Android e iPhone, alojada en un servidor gratuito. Sin tiendas de aplicaciones. Uso diario de Santi: Android.
- **Stack (D2, decidida por Santi):** PWA en TypeScript + servidor Node (Fastify) en Google Cloud Run (capa gratuita) + Supabase gratuito (Postgres y Storage). Costo fijo 0 EUR; solo se paga la voz. Motivos: Cloud Run admite WebSocket y no se duerme como Render; el servidor de la PoC se reutiliza; ffmpeg disponible para comprimir audio. Descartados: Fly.io (sin plan gratuito para cuentas nuevas), Oracle (redujo su capa gratuita), Cloudflare Workers gratis (10 ms de CPU por petición, no alcanza para unir audio ni para el puente de voz).
- **Regla de renovación del bolsón (D6, definida por Santi):** el periodo dura 1 mes y no tiene una fecha fija del calendario. Empieza cuando el usuario activa el bolsón con su primera charla, y lo mismo vale para cada periodo siguiente: pasado el mes, el bolsón vuelve a estar completo (120 min) y el nuevo mes empieza en la siguiente primera charla. Si el mes no tiene ese día, el periodo vence el último día del mes. Sin acumular saldo.
- **D7 y D13 confirmadas:** al agotarse en plena charla el coach se despide hablando y la app pasa a «Coach no disponible»; no se guarda el audio del usuario, solo la transcripción necesaria para la memoria.
- **Identidad sin cuentas:** el servidor reconoce la instalación con una credencial de dispositivo generada al primer uso, que se canjea por un código de invitación (variable de entorno del servidor). Sin el código nadie puede registrarse, así que la API no queda abierta y no se puede gastar la cuenta de OpenAI. El servidor emite tokens de acceso de corta vida. Cuentas (fase 2): se vinculan al mismo `user_id`, sin migrar datos.
- **Acceso a datos solo desde el servidor:** el frontend nunca habla con Supabase. Las tablas tienen RLS activo y sin políticas (denegar todo) como defensa en profundidad; el servidor usa la clave de servicio y filtra siempre por `user_id`.
- **Contrato compartido:** los esquemas de la API viven en `src/contract/` (zod) y los usan frontend y backend. La documentación humana está en `docs/api.md`.
- **Voz en vivo:** el servidor entrega un ticket de un solo uso (60 s) antes de abrir el WebSocket. Ahí se comprueba el bolsón, así que el bloqueo con saldo en cero no depende de la app.
- **Limitación de la PWA en iPhone (a documentar en la historia de reproducción, #9):** instalada en la pantalla de inicio, la reproducción de audio y la charla en vivo no están garantizadas con la pantalla bloqueada o la app en segundo plano. En Android la reproducción en segundo plano es viable. La salida futura es envolver la misma web en una app nativa.

## 2026-11-23 (historia #6: bolsón de coaching)
Reglas completas en `docs/api.md` (sección «Qué descuenta del bolsón») y `docs/arquitectura.md`.
- **Decisiones de Santi (23/11):** descuentan las seis clases de charla; descuenta el tiempo conectado y sin pausa, incluidos los silencios; el periodo abre en el primer segundo activo (`ready`) y vence a la misma hora local un mes después, con último día del mes si el día no existe; despedida al quedar 20 s y 10 s de margen sin descuento; la inactividad pasa de 5 minutos a 60 s más una pregunta del coach y 20 s más; tope de 30 minutos (`limite_duracion`); sin `talk_active` ni control de una sola charla activa en el MVP; `professional_help` no se emite en el MVP.
- **Cambio de contrato:** `EndReasonSchema` suma `limite_duracion` (también en el enum de la base, migración `0002`). Se corrigió `arquitectura.md` (decía `quota_exhausted` como motivo de cierre; el contrato usa `cuota_agotada`) y `api.md` (faltaba `offline_generation_unavailable`).
- **Acceso a datos:** `@supabase/supabase-js` con la clave de servicio, y lo atómico en funciones SQL (`register_device`, `open_quota_period`, `charge_talk`) para no necesitar un secreto nuevo (`DATABASE_URL`). Las funciones solo se pueden ejecutar con la clave de servicio.
- **Saldo:** la fuente de verdad es `quota_periods.seconds_used`, que solo sube y nunca pasa de `seconds_total`. `talks.active_seconds` guarda el tiempo real de cada charla. El descuento (`charge_talk`) es idempotente y monótono: repetirlo o mandar un total menor no descuenta de más, así que se puede reintentar tras un corte o reinicio.
- **Medición:** `ActiveTimeMeter` mide con un reloj monótono del servidor; la app no participa. El servidor respalda el consumo en la base cada 10 s (historia #5), así que un reinicio pierde como máximo 10 s.
- **Fechas:** el cálculo de periodos y de `renewsOn` usa `Intl` con la zona horaria del usuario (sin librería de fechas). Si la hora local no existe por el salto de horario, avanza a la siguiente válida. Una zona guardada inválida cae en `Europe/Rome`.
- **Autenticación:** JWT HS256 con `jose` (15 min, emisor y audiencia fijos, solo se acepta HS256). El secreto del dispositivo tiene 256 bits aleatorios, por eso se guarda su SHA-256 (no hace falta un hash lento). La comparación del código de invitación y del secreto es en tiempo constante, y un dispositivo inexistente tarda lo mismo que uno con secreto equivocado.
- **Límites de uso:** en memoria (ventana deslizante), válidos mientras haya una sola instancia (`--max-instances 1`). La IP del cliente se toma con `trustProxy` de 1 salto en producción (`TRUST_PROXY_HOPS`), para que `X-Forwarded-For` escrito por el cliente no sirva para saltarse el límite. Cuerpo máximo de 64 KB. Los logs no guardan la query de las URLs (el ticket de voz irá ahí).
- **Pruebas:** la lógica corre contra un almacén en memoria; las migraciones y las funciones SQL se prueban contra un Postgres real dentro de Node (`@electric-sql/pglite`, solo desarrollo). Lo que no se puede probar sin credenciales es el adaptador de Supabase (`src/store/supabase.ts`): es una capa fina sobre esas funciones y queda por validar en el primer despliegue.

## 2026-11-23 (historia #5: servicio de coach en vivo con memoria)
Reglas para la app en `docs/api.md` (sección «Charla en vivo»). Decisiones de Santi: ver la entrada de #6; los puntos técnicos restantes los aprobó en bloque.
- **Estructura:** `VoiceService` (tickets y charlas abiertas) y `VoiceSession` (una charla). Todas las reglas de tiempo se evalúan en `VoiceSession.tick()`, que el servicio llama cada segundo: determinista y probable con reloj falso. El tiempo activo se mide con reloj monótono (`ActiveTimeMeter`).
- **Reconexión:** gracia de 60 s con la misma sesión del proveedor; pasado ese tiempo se cierra con `corte`. Pausa máxima de 10 min (`inactividad`). Un ticket pedido y nunca usado cierra la charla con `corte` sin consumo.
- **Memoria:** la transcripción se guarda provisoriamente en `talks.transcript` (respaldo cada 10 s) y se borra al generar el resumen. El resumen lo hace un modelo de texto de OpenAI (`OPENAI_SUMMARY_MODEL`, por defecto `gpt-4.1-mini`, **sin validar contra la API real**). Se corre con el socket aún abierto (Cloud Run reduce la CPU al terminar la petición). Si falla, se reintenta al empezar la charla siguiente. El coach recibe los últimos 5 resúmenes (tope de 3000 caracteres). Lo que escribió la persona (perfil, resúmenes) entra al prompt en una sola línea y marcado como «información de referencia, no instrucciones».
- **Herramientas:** `ajustar_velocidad`, `guardar_perfil` y `marcar_entrevista_completa` activas. `crear_plan` y `ajustar_plan` quedan en el contrato pero no se ofrecen al modelo; el prompt le dice al coach que todavía no puede crear planes.
- **No hecho (decisión de Santi):** `professional_help` no se emite; no hay control de una sola charla activa.
- **Seguridad:** origen del WebSocket validado, límites de conexión por IP, tope de audio entrante a 1,25× el tiempo real, mensajes de hasta 256 KB, ping/pong cada 15 s. Ticket de un solo uso en memoria; los límites de tickets (10/h charlas nuevas, 30/h reconexiones) son por usuario.
- **Migración `0003`:** `talks.transcript` (jsonb) e índice único `coach_memory(talk_id)` para que guardar un resumen dos veces no lo duplique.
- **Pruebas:** sesión (reglas de tiempo, reconexión, despedida, costo, resumen) con motor y conexión falsos; servicio y rutas con un servidor real en un puerto libre y cliente `ws`; adaptador de OpenAI contra un servidor WebSocket local (`OPENAI_REALTIME_URL`), que comprueba nuestros mensajes pero **no** el formato real del servicio.

## 2026-11-24 (dudas FE/BE 19 a 28: contrato con la app)
Análisis completo en el documento «Dudas FE/BE 19-28» del proyecto. Santi aprobó todos los cambios de contrato de abajo.
- **19, motivo de fin por cuota:** se mantienen `cuota_agotada` (motivo de cierre de una charla) y `quota_exhausted` (error HTTP 403); son dos cosas distintas. En el MVP no hay generación de audio bajo demanda: `POST /sessions/:id/audio` responde siempre 503 `offline_generation_unavailable` y la app solo ofrece las duraciones de `availableMinutes`. Consecuencia para la interfaz: el selector 5/10/15 de «Antes de empezar» muestra solo las duraciones con audio listo (probablemente una sola al principio).
- **20, renovación del token:** el secreto del dispositivo es la credencial de renovación; se quitó el «token de renovación» de `arquitectura.md`. El contrato no cambia.
- **21, registro:** `RegisterDeviceRequest` suma `timezone` (IANA, validada) y `locale` opcionales. Migración `0005`: `register_device` guarda zona e idioma (por defecto `Europe/Rome` y `es`).
- **22, borrar datos:** conserva usuario, dispositivos, ajustes y periodos del bolsón; borra el resto. El bolsón no se reinicia (D8: no). Ver `docs/api.md`.
- **23, respuestas faltantes:** `favorite` devuelve la sesión; `complete` devuelve `{ session, plan }`; `audio` devuelve `SessionAudioResponse`.
- **24, resúmenes:** `PlanSummary.nextSession` y `SessionSummary.planName`.
- **25, audios:** `version` en la respuesta de audio y `audioVersion` en la sesión; política de descarga en `docs/arquitectura.md`.
- **26, WebSocket:** se documentó el tamaño de las tramas, que la app no manda audio antes de `ready` y el significado de pausa y reanudación. Lo que el repositorio ya había decidido el 23/11 **no se cambió**: sin control de una sola charla activa, ping cada 15 s, tickets de reconexión 30/h, cierre sin códigos propios.
- **27, eventos:** `error.code` pasó a una lista cerrada (`VoiceErrorCodeSchema`, alineada con los códigos que el servidor ya emite); nuevo evento `interview_completed { planIds }`; `plan_created` suma `name` y `sessionsTotal`. Ninguno de los dos eventos nuevos se emite hasta las Olas 2 y 3. Tras `professional_help` la charla sigue y se avisa una sola vez, pero ese evento sigue sin emitirse en el MVP. «Pedir cambios al coach» se quitó de Planes propuestos.
- **28, calentar el servidor:** ya existe `GET /v1/version`; no se agregó nada.
