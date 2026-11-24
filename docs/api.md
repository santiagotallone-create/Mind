# Contrato de API v1

Historia #3. **Los esquemas exactos están en `src/contract/` (zod) y son la fuente de verdad**; frontend y backend importan los mismos tipos. Este documento explica el comportamiento.

Regla de trabajo: cualquier cambio que afecte este contrato se consulta antes a Santi. El frontend lo revisa antes de integrar y deja sus dudas como comentarios en la historia #3.

## Convenciones
- Base: `https://<servidor>/v1`. JSON UTF-8. Fechas ISO 8601 con zona horaria; las fechas de renovación son `AAAA-MM-DD` en la zona horaria del usuario.
- Autenticación: `Authorization: Bearer <accessToken>` en todo salvo `/auth/*`, `/health` y `/v1/version`.
- Errores: `{ "error": { "code": "...", "message": "..." } }`. Códigos: `invalid_request` (400), `unauthorized` (401), `invalid_invite` (403), `quota_exhausted` (403), `not_found` (404), `rate_limited` (429), `offline_generation_unavailable` (503, la generación de audio no está disponible sin conexión con el proveedor; la usa #7), `internal` (500).
- Toda la información de un usuario se filtra por su `user_id` en el servidor.

## Identidad
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /auth/device` | `{ inviteCode, deviceSecret, deviceName?, timezone?, locale? }` | `{ deviceId, accessToken, expiresInSeconds }` |
| `POST /auth/token` | `{ deviceId, deviceSecret }` | `{ deviceId, accessToken, expiresInSeconds }` |

El token de acceso dura 15 minutos. La app lo renueva sola con `/auth/token`: el secreto del dispositivo es la credencial de renovación (no hay un token de renovación aparte). Sin código de invitación válido no hay registro.

`timezone` (nombre IANA, por ejemplo `Europe/Rome`; la app envía la del navegador) y `locale` (`es` o `it`; la app envía `es`) son opcionales. Si faltan, el servidor usa `Europe/Rome` y `es`. Un nombre de zona que no existe responde 400 `invalid_request`. Si la persona cambia de zona, la app lo corrige con `PATCH /settings`; la fecha de vencimiento de un periodo ya abierto no se recalcula.

## Bolsón
| Método y ruta | Respuesta |
|---|---|
| `GET /quota` | `{ state: sin_iniciar \| disponible \| agotado, secondsTotal, secondsRemaining, minutesRemaining, periodStartsAt, renewsOn }` |

- `sin_iniciar`: no hay periodo abierto (aún no hubo charla, o el último periodo venció). Saldo completo y `renewsOn: null`. La primera charla abre un periodo nuevo de 1 mes.
- `renewsOn` es el vencimiento del periodo abierto, como fecha explícita; `null` si no hay periodo abierto.
- El saldo exacto se muestra solo en Ajustes (historia #15). La pantalla de la charla no lo muestra.

## Charla en vivo
1. `POST /voice/tickets` con `{ talkType, planId?, sessionId?, resumeTalkId? }` devuelve `{ talkId, ticket, wsUrl, expiresInSeconds }`. Si el bolsón está en cero responde **403 `quota_exhausted`**: el bloqueo es del servidor, no de la app.
2. Abrir `wsUrl` (WebSocket) dentro de los 60 segundos. El ticket es de un solo uso.
3. Tramas **binarias**: audio PCM 16 bits, mono, 24 kHz, en ambos sentidos.
4. Tramas de **texto**: JSON de control (cliente: `pause`, `resume`, `end`) y eventos (servidor: `ready`, `paused`, `resumed`, `interrupted`, `transcript`, `plan_creating`, `plan_created`, `interview_completed`, `professional_help`, `error`, `ended`).
   - Tamaño de las tramas de audio: la app envía tramas de 100 ms (4800 bytes: 2400 muestras de 16 bits); el servidor puede enviar tramas de cualquier tamaño hasta 32 KB, siempre con un número par de bytes. La app no manda audio antes de recibir `ready`.
   - `pause` detiene el descuento y el envío de audio; el coach no habla mientras dure. `resume` lo retoma. La pausa se confirma con `paused` y `resumed`.
   - `plan_created` trae `{ planId, name, sessionsTotal }`; tras una reconexión puede repetirse y la app descarta los que ya tiene por `planId`. `interview_completed` trae `{ planIds }` y significa que la entrevista inicial terminó y esos planes están listos para mostrarse juntos en «Planes propuestos». Como `crear_plan` no se ofrece al modelo hasta las Olas 2 y 3, el servidor todavía no emite ninguno de los dos.
5. La app **no muestra** `transcript`: es de uso interno. No hay resúmenes escritos ni registros de lo que dijo el coach.
6. Al agotarse el bolsón en plena charla, el coach se despide hablando y llega `ended` con `reason: "cuota_agotada"`. La app pasa a «Coach no disponible». Cuando quedan 20 segundos el servidor le pide al coach que se despida; al llegar a cero hay 10 segundos de margen (no se descuentan) para terminar la frase y después se corta.
7. Corte de red: el servidor conserva la charla 60 segundos con la misma sesión del proveedor. La app pide un ticket nuevo con `resumeTalkId` para reconectar. Pasado ese tiempo la charla se cierra con `corte`, y un `resumeTalkId` de una charla cerrada responde 404. El tiempo sin conexión y el tiempo en pausa no descuentan.
8. Tipos de charla: `libre`, `entrevista`, `cierre` (requiere `sessionId`), `plan` (requiere `planId`), `meditacion` (requiere `sessionId`), `plan_nuevo`.
9. El evento `professional_help` está definido en el contrato, pero **el servidor no lo emite en el MVP** (decisión de Santi, 23/11). El coach sigue sugiriendo consultar a un profesional con su prompt, pero la app no recibe un estado aparte. Cuando se emita (fase posterior), la charla **no se corta**: la app muestra un aviso con una ✕ para cerrarlo, una sola vez por charla.

10. Errores del ticket: `403 quota_exhausted` (saldo en cero, para las seis clases de charla), `404 not_found` (plan o sesión que no son del usuario, o `resumeTalkId` de una charla que ya terminó o es de otra persona), `429 rate_limited` (ver Límites) y `401` sin token de acceso.
11. El WebSocket no usa el token de acceso: se entra con el ticket. Si el ticket no sirve (usado, vencido o inventado) o el origen no está permitido, el servidor manda `{ "type": "error", "code": "invalid_ticket" | "origin_not_allowed" | "rate_limited", "retryable": false }` y cierra. El `code` del evento `error` es una lista cerrada (`VoiceErrorCodeSchema`): esos tres, `start_failed`, `talk_not_found` (reconexión a una charla que ya no existe), `invalid_message` (mensaje de control que no se entiende) y `provider_error` (falló el proveedor de voz en plena charla). La app decide por `retryable`, no por el código. Si la charla no pudo arrancar (el proveedor de voz no conectó) manda `error` con `code: "start_failed"` y `retryable: true`, cierra con `ended`/`error` y **no abre el periodo del bolsón**.
12. Al reconectar con `resumeTalkId`, el servidor manda otra vez `ready` (con el mismo `talkId`) y, si la charla estaba en pausa, `paused`.
13. La app puede mandar audio como máximo a 1,25 veces el tiempo real; lo que exceda se descarta (protege el costo de un cliente defectuoso).
14. Al cerrar la charla el servidor genera un resumen interno con un modelo de texto de OpenAI y borra la transcripción; si el resumen falla, la transcripción queda guardada y se completa al empezar la charla siguiente. Nada de esto sale por la API.

Herramientas del coach. En esta versión el coach tiene `ajustar_velocidad` (guarda también `settings.voiceSpeed`), `guardar_perfil` y `marcar_entrevista_completa`. `crear_plan` y `ajustar_plan` están en el contrato (`CoachToolsSchema`) pero **no se le ofrecen al modelo** hasta las Olas 2 y 3; si la persona pide un plan, el coach le dice que todavía no está disponible.

## Planes y meditaciones
| Método y ruta | Descripción |
|---|---|
| `GET /plans` | Lista de planes con progreso (`sessionsDone` / `sessionsTotal`). Un plan completado sigue visible. |
| `GET /plans/:id` | Plan y sus sesiones, con `done`, `favorite` y `availableMinutes`. |
| `GET /favorites` | Sesiones marcadas como favoritas (la lista vacía muestra «Aún no tienes favoritas»). |
| `PUT /sessions/:id/favorite` | `{ favorite }`. Responde la **sesión** ya actualizada (`SessionSummary`). Idempotente. |
| `POST /sessions/:id/complete` | La app lo envía al llegar al final de la reproducción (D9, propuesta). Cuerpo opcional `{ completedAt }` para una reproducción hecha sin conexión (no puede ser una fecha futura). Responde `{ session, plan }` ya actualizados; el plan pasa a `completado` al hacer la última sesión. Idempotente: repetirlo no cambia `doneAt`. |
| `GET /sessions/:id/audio?minutes=5\|10\|15` | `{ status, minutes, url, expiresAt, format: "m4a", bytes, durationSeconds, version }`. `url` es una URL firmada de descarga y solo existe con `status: lista`; `version` identifica el guion (ver `docs/arquitectura.md`, almacenamiento local). Para una duración que nunca se pidió, el servidor responde 404 `not_found` (el backend lo confirma al implementar la ruta). |
| `POST /sessions/:id/audio` | `{ minutes }`: pide generar esa duración (bajo demanda, con conexión). **No habilitada en el MVP**: responde siempre 503 `offline_generation_unavailable` (no reintentable) y la app no la llama; solo ofrece las duraciones de `availableMinutes`. Cuando se habilite responderá `SessionAudioResponse`: 202 con `pendiente` o `generando`, 200 si ya está `lista`. |

Cada sesión trae `planName` (nombre de su plan), `audioVersion` (versión del audio vigente, o `null` si no hay ninguno listo) y `availableMinutes`. Cada plan trae `nextSession` (`{ id, position, title, suggestedMinutes }`: la primera sesión sin hacer; `null` si el plan está completado), para mostrar la tarjeta sin pedir el detalle.

Los planes los crea y ajusta el coach desde la charla; no hay `POST /plans` para la app en el MVP.

La reproducción **no** usa la API: la app descarga el audio una vez, lo guarda en el celular y lo reproduce sin conexión.

## Perfil, ajustes y borrado
| Método y ruta | Descripción |
|---|---|
| `GET /profile`, `PATCH /profile` | Objetivos, experiencia (`principiante`, `algo_practica`, `mucha_practica`) y estado actual. El usuario corrige con «Editar». |
| `GET /settings`, `PATCH /settings` | `locale`, `timezone`, `voiceSpeed` (0,5 a 1,5). |
| `DELETE /me/data` | Borra los datos de la persona. Sin deshacer. Responde `{ deleted: true, deletedAt }`. |

Qué borra `DELETE /me/data`: perfil, planes, sesiones, audios (con sus archivos), charlas, memoria del coach y tickets de voz. Qué **conserva**: el usuario, los dispositivos, los ajustes y los periodos del bolsón. Por eso la persona sigue dentro de la app sin pedir un código nuevo, el perfil queda vacío (`interviewCompletedAt` en `null`, así que la app vuelve a «Primer uso») y el bolsón **no** se reinicia: borrar los datos no devuelve minutos. El texto de privacidad debe decir exactamente esto.

## Límites de uso (protección de costo)
- Registro: máximo 5 intentos por hora y dirección IP.
- API general: 60 peticiones por minuto por usuario.
- Tickets de voz: 10 por hora por usuario para charlas nuevas. Los tickets de reconexión (`resumeTalkId`) tienen un límite aparte de 30 por hora, para que una red inestable no agote el primero.
- Una sola charla activa por usuario: **fuera del MVP** (decisión de Santi, 23/11). El servidor no lo hace cumplir ni existe un código de error para ello. Un doble toque o dos dispositivos pueden abrir dos sesiones a la vez; con una sola persona usando la app el costo extra es puntual y pequeño.
- Charla, inactividad: tras 60 segundos sin que nadie hable (ni el usuario ni el coach) el coach pregunta si sigue ahí; si pasan 20 segundos más sin respuesta, la charla se cierra (`ended`, `inactividad`). Los dos valores son configurables por entorno.
- Charla, duración: se cierra a los 30 minutos continuos (`ended`, `limite_duracion`).
- Pausa: dura como máximo 10 minutos; después la charla se cierra con `inactividad`.

## Qué descuenta del bolsón
- Descuentan las seis clases de charla (`libre`, `entrevista`, `cierre`, `plan`, `meditacion`, `plan_nuevo`) y las seis se bloquean con el saldo en cero: el costo de la voz es el mismo.
- Descuenta el **tiempo activo**: WebSocket conectado y sin pausa, incluidos los silencios. No descuentan la pausa ni el tiempo sin conexión.
- El periodo se abre en el primer segundo activo de la primera charla (evento `ready`), no al pedir el ticket.
- El periodo vence a la misma hora local, un mes después (si el día no existe, el último día del mes). `renewsOn` es la fecha local de ese vencimiento. Si vence en plena charla, la charla sigue y descuenta del periodo en que empezó, sin pasar de 120 minutos.

Los valores son iniciales y se ajustan al medir el uso real.

## Fuera de este contrato
Cuentas y login, compra de más tiempo, notificaciones.
