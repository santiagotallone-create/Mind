# Arquitectura del MVP

Historia #3. Las decisiones y sus motivos están en `docs/decisiones.md` (entrada del 2026-11-23). Este documento describe cómo encaja todo.

## Piezas

```
 Celular (PWA, TypeScript)                Google Cloud Run (Node + Fastify)            Proveedores
 ┌──────────────────────────┐   HTTPS    ┌───────────────────────────────────┐
 │ Pantallas + catálogo de  │ ─────────► │ API REST /v1 (auth, bolsón, planes│
 │ textos por idioma        │            │ perfil, ajustes, borrado)         │
 │ Service worker + IndexedDB│            │                                   │
 │ (planes y audios offline)│   WSS      │ Puente de voz /v1/voice           │ ──► OpenAI Realtime
 │                          │ ◄────────► │  (VoiceProvider)                  │      (VoiceProvider)
 └──────────────────────────┘            │ Generador de meditaciones         │ ──► OpenAI TTS u otro
                                         │  (SpeechProvider + ffmpeg)        │      (SpeechProvider)
                                         │ Generador de guiones              │ ──► Por decidir (D3)
                                         │  (ScriptProvider, nuevo)          │      (ScriptProvider)
                                         └──────────────┬────────────────────┘
                                                        │ clave de servicio
                                                        ▼
                                         Supabase gratuito: Postgres (RLS) + Storage privado
```

- El frontend **solo** habla con nuestro servidor. Nunca con Supabase ni con los proveedores. Las claves viven solo en el servidor.
- El servidor es sin estado entre peticiones, salvo las sesiones de voz abiertas (en memoria, con respaldo del consumo en base de datos cada pocos segundos para sobrevivir a un reinicio).
- Cloud Run escala a cero: la primera petición tras un rato inactivo tarda 1 a 3 segundos. La app avisa al servidor al abrir el Inicio para calentarlo antes de que el usuario toque «Hablar».

## Identidad sin cuentas

1. Primer uso: la app genera un `deviceId` y un secreto aleatorio de 256 bits y los guarda en el almacenamiento del navegador.
2. `POST /v1/auth/device` con el **código de invitación** (variable `INVITE_CODE` del servidor) crea el usuario y el dispositivo. El servidor guarda solo el hash del secreto.
3. El servidor responde con un token de acceso (JWT, 15 min) y un token de renovación. La app renueva sola.
4. Sin código de invitación válido no hay registro: la API no queda abierta y nadie puede gastar la cuenta de OpenAI.
5. Límite de uso por dirección IP y por usuario (ver `docs/api.md`, sección Límites).
6. Fase 2 (cuentas): se agrega un método de ingreso (correo, Google) que se vincula al mismo `user_id`. Los datos no se migran.
7. Si el navegador borra el almacenamiento (iPhone lo hace tras un tiempo sin uso), el dispositivo se registra de nuevo y es un usuario distinto. En el MVP se acepta: el dueño recupera con una vinculación manual hecha por Santi en la base. Queda como riesgo conocido y mejora de la fase 2.

## Modelo de datos

Todas las tablas llevan `user_id` y el servidor filtra siempre por él. Migración completa en `supabase/migrations/0001_init.sql`.

| Tabla | Para qué | Campos clave |
|---|---|---|
| `users` | Un usuario (en el MVP, uno solo) | `id`, `locale` (es), `timezone` |
| `devices` | Instalaciones reconocidas | `user_id`, `secret_hash`, `revoked_at` |
| `profiles` | Perfil que arma el coach (A4) | `goals`, `experience` (principiante, algo_practica, mucha_practica), `current_state`, `interview_completed_at` |
| `plans` | Planes (F2) | `name`, `status` (activo, completado, archivado), `created_by` (coach, usuario) |
| `sessions` | Sesiones/meditaciones de un plan | `plan_id`, `position`, `title`, `technique`, `suggested_minutes`, `done_at`, `favorite` |
| `session_audios` | Audio generado por duración (5, 10 o 15) | `session_id`, `minutes`, `storage_path`, `bytes`, `status` (pendiente, generando, lista, error), `script_hash` |
| `talks` | Cada charla con el coach | `type`, `plan_id`, `session_id`, `started_at`, `ended_at`, `active_seconds`, `end_reason`, `metrics` (latencia, tokens, costo) |
| `coach_memory` | Resumen interno por charla. **Nunca se expone por la API** | `talk_id`, `summary` |
| `quota_periods` | Bolsón (F5): un periodo por activación | `starts_at`, `ends_at`, `seconds_total` (7200), `seconds_used` |
| `settings` | Ajustes | `locale`, `timezone`, `voice_speed` |

Notas:
- El consumo del bolsón sale de `talks.active_seconds` (suma por periodo) y se cachea en `quota_periods.seconds_used`. El tiempo en pausa y sin conexión no entra en `active_seconds`.
- Audios: bucket privado `meditaciones`, ruta `{user_id}/{session_id}/{minutes}.m4a`. Se guardan comprimidos (AAC) para caber en 1 GB: unos 0,4 MB por minuto frente a 2,9 MB por minuto del WAV.
- `coach_memory` solo lo lee el servidor al armar el contexto de la charla siguiente.
- Borrado total (A5): elimina el usuario y todo lo que cuelga de él, incluidos los audios. Qué pasa con el bolsón queda pendiente (D8, propuesta del analista: no se reinicia).

## Regla del bolsón (F5)

- 120 minutos por periodo. Sin fecha fija del calendario: el periodo empieza cuando el usuario **activa el bolsón** con su primera charla y dura 1 mes (si el mes no tiene ese día, vence el último día del mes). No se acumula saldo.
- Cada periodo se activa igual: al vencer uno, el bolsón queda completo y el siguiente mes empieza en la primera charla posterior. Entre el vencimiento y esa charla no hay periodo abierto.
- Estado `sin_iniciar`: no hay periodo abierto (nunca hubo charla, o el último ya venció). Saldo completo y sin fecha de renovación.
- Estado `agotado`: saldo en cero dentro de un periodo abierto. La fecha en que vuelve el coach es el vencimiento de ese periodo.
- La fecha de renovación (`renewsOn`, `AAAA-MM-DD` en la zona horaria del usuario) es el vencimiento del periodo abierto. La app la formatea desde el catálogo de textos: nunca «el mes próximo».
- El servidor rechaza abrir una charla con saldo cero (ticket de voz → 403 `quota_exhausted`). Si se agota en plena charla, el coach se despide hablando y el servidor cierra con `reason: "cuota_agotada"`.
- La implementación y los tests de borde son de la historia #6.

## Almacenamiento local en el celular (offline)

- Service worker: carga la app sin conexión.
- IndexedDB: planes, sesiones, favoritas y estado del bolsón (último valor conocido).
- Cache Storage / IndexedDB: audios de las meditaciones descargadas. La descarga se hace con conexión; la reproducción no la necesita.
- El detalle de la sincronización (qué se guarda y cuándo se limpia) lo cierra el frontend en #4 y #8, dentro de este marco.
- Limitación conocida: iPhone puede liberar el almacenamiento de una web que no se usa durante un tiempo. Android no.

## Idioma

- Español en el MVP; italiano en la fase 2 sin cambios de código.
- Prompt del coach: un archivo por idioma en `src/coach/prompts/`. Guiones de meditación: un archivo por idioma.
- Textos de la app: catálogo por idioma en el frontend (historia #4). El idioma vive en `settings.locale` y en `users.locale`.

## Proveedores detrás de interfaces propias

| Interfaz | Estado | Motor del MVP |
|---|---|---|
| `VoiceProvider` | Existe (`src/voice/provider.ts`) | OpenAI Realtime, modelo mini |
| `SpeechProvider` | Existe (`src/meditation/speech.ts`) | OpenAI TTS (se retira el 2027-01-06; reemplazo en #7, D4) |
| `ScriptProvider` | Nueva, la define #7 | Por decidir (D3): API de modelo o semi-manual |

## Seguridad

- Claves de proveedores solo en variables de entorno del servidor (en Cloud Run: Secret Manager).
- Tokens de acceso de 15 minutos; renovación revocable (`devices.revoked_at`).
- Ticket de voz de un solo uso y 60 segundos de vida: la URL del WebSocket no contiene el token de acceso.
- RLS activo y sin políticas en todas las tablas: aunque se filtrara la clave pública de Supabase, no se podría leer nada.
- No se guarda el audio del usuario, solo la transcripción necesaria para la memoria (D13). Lo que digan los textos de privacidad debe salir de aquí.
- Validación de todo lo que entra con los esquemas de `src/contract/`.

## Entorno, despliegue y CI

- Desarrollo: `npm install`, `.env` según `.env.example`, `npm run dev:server` (servidor), `npm run typecheck`, `npm test`.
- CI (GitHub Actions): typecheck y tests en cada rama y pull request.
- Despliegue: `Dockerfile` listo; los pasos para Google Cloud y Supabase están en `docs/despliegue.md`. Los hace Santi (necesitan sus cuentas).

## Decisiones que siguen abiertas

- Framework de la PWA (React, Svelte u otro): lo elige el frontend en #4 y lo registra aquí.
- D3 y D4 (guiones y síntesis de voz): historia #7.
- D8 (borrado y bolsón): historia #15.
