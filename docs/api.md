# Contrato de API v1

Historia #3. **Los esquemas exactos están en `src/contract/` (zod) y son la fuente de verdad**; frontend y backend importan los mismos tipos. Este documento explica el comportamiento.

Regla de trabajo: cualquier cambio que afecte este contrato se consulta antes a Santi. El frontend lo revisa antes de integrar y deja sus dudas como comentarios en la historia #3.

## Convenciones
- Base: `https://<servidor>/v1`. JSON UTF-8. Fechas ISO 8601 con zona horaria; las fechas de renovación son `AAAA-MM-DD` en la zona horaria del usuario.
- Autenticación: `Authorization: Bearer <accessToken>` en todo salvo `/auth/*`, `/healthz` y `/v1/version`.
- Errores: `{ "error": { "code": "...", "message": "..." } }`. Códigos: `invalid_request` (400), `unauthorized` (401), `invalid_invite` (403), `quota_exhausted` (403), `not_found` (404), `rate_limited` (429), `internal` (500).
- Toda la información de un usuario se filtra por su `user_id` en el servidor.

## Identidad
| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /auth/device` | `{ inviteCode, deviceSecret, deviceName? }` | `{ deviceId, accessToken, expiresInSeconds }` |
| `POST /auth/token` | `{ deviceId, deviceSecret }` | `{ deviceId, accessToken, expiresInSeconds }` |

El token de acceso dura 15 minutos. La app lo renueva sola con `/auth/token`. Sin código de invitación válido no hay registro.

## Bolsón
| Método y ruta | Respuesta |
|---|---|
| `GET /quota` | `{ state: sin_iniciar \| disponible \| agotado, secondsTotal, secondsRemaining, minutesRemaining, periodStartsAt, renewsOn }` |

- `renewsOn` es una fecha explícita o `null` si aún no hubo primer uso.
- El saldo exacto se muestra solo en Ajustes (historia #15). La pantalla de la charla no lo muestra.

## Charla en vivo
1. `POST /voice/tickets` con `{ talkType, planId?, sessionId?, resumeTalkId? }` devuelve `{ talkId, ticket, wsUrl, expiresInSeconds }`. Si el bolsón está en cero responde **403 `quota_exhausted`**: el bloqueo es del servidor, no de la app.
2. Abrir `wsUrl` (WebSocket) dentro de los 60 segundos. El ticket es de un solo uso.
3. Tramas **binarias**: audio PCM 16 bits, mono, 24 kHz, en ambos sentidos.
4. Tramas de **texto**: JSON de control (cliente: `pause`, `resume`, `end`) y eventos (servidor: `ready`, `paused`, `resumed`, `interrupted`, `transcript`, `plan_creating`, `plan_created`, `professional_help`, `error`, `ended`).
5. La app **no muestra** `transcript`: es de uso interno. No hay resúmenes escritos ni registros de lo que dijo el coach.
6. Al agotarse el bolsón en plena charla, el coach se despide hablando y llega `ended` con `reason: "cuota_agotada"`. La app pasa a «Coach no disponible».
7. Corte de red: el servidor conserva la charla unos segundos. La app pide un ticket nuevo con `resumeTalkId` para reconectar. El tiempo sin conexión y el tiempo en pausa no descuentan.
8. Tipos de charla: `libre`, `entrevista`, `cierre` (requiere `sessionId`), `plan` (requiere `planId`), `meditacion` (requiere `sessionId`), `plan_nuevo`.

Herramientas del coach (contrato; la implementación llega en las Olas 2 y 3): `ajustar_velocidad`, `crear_plan`, `ajustar_plan`, `guardar_perfil`, `marcar_entrevista_completa`. Sus argumentos están en `CoachToolsSchema`.

## Planes y meditaciones
| Método y ruta | Descripción |
|---|---|
| `GET /plans` | Lista de planes con progreso (`sessionsDone` / `sessionsTotal`). Un plan completado sigue visible. |
| `GET /plans/:id` | Plan y sus sesiones, con `done`, `favorite` y `availableMinutes`. |
| `GET /favorites` | Sesiones marcadas como favoritas (la lista vacía muestra «Aún no tienes favoritas»). |
| `PUT /sessions/:id/favorite` | `{ favorite }`. |
| `POST /sessions/:id/complete` | La app lo envía al llegar al final de la reproducción (D9, propuesta). |
| `GET /sessions/:id/audio?minutes=5\|10\|15` | `{ status, url, expiresAt, format: "m4a", bytes, durationSeconds }`. `url` es una URL firmada de descarga y solo existe con `status: lista`. |
| `POST /sessions/:id/audio` | `{ minutes }`: pide generar esa duración (bajo demanda, con conexión). |

Los planes los crea y ajusta el coach desde la charla; no hay `POST /plans` para la app en el MVP.

La reproducción **no** usa la API: la app descarga el audio una vez, lo guarda en el celular y lo reproduce sin conexión.

## Perfil, ajustes y borrado
| Método y ruta | Descripción |
|---|---|
| `GET /profile`, `PATCH /profile` | Objetivos, experiencia (`principiante`, `algo_practica`, `mucha_practica`) y estado actual. El usuario corrige con «Editar». |
| `GET /settings`, `PATCH /settings` | `locale`, `timezone`, `voiceSpeed` (0,5 a 1,5). |
| `DELETE /me/data` | Borra todos los datos y audios del usuario. Sin deshacer. Responde `{ deleted: true, deletedAt }`. |

## Límites de uso (protección de costo)
- Registro: máximo 5 intentos por hora y dirección IP.
- API general: 60 peticiones por minuto por usuario.
- Tickets de voz: 10 por hora por usuario.
- Una sola charla activa por usuario.
- Charla: se cierra tras 5 minutos de inactividad (`ended`, `inactividad`) y tras 30 minutos continuos.

Los valores son iniciales y se ajustan al medir el uso real.

## Fuera de este contrato
Cuentas y login, compra de más tiempo, notificaciones.
