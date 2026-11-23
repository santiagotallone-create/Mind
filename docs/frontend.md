# Frontend de la PWA: revisión previa y propuesta de framework

Historia #4. Documento del agente frontend, escrito **antes de programar**. Estado: **pendiente de respuestas de Santi**. No hay código de la app en esta rama. Cuando se aprueben las propuestas, las decisiones firmes pasan a `docs/decisiones.md` y el framework se registra en `docs/arquitectura.md` (sección «Decisiones que siguen abiertas»).

Se revisaron: `docs/arquitectura.md`, `docs/api.md`, `docs/decisiones.md`, `src/contract/` (zod), el issue #4, los documentos del proyecto (`requisitos-mvp`, `ux-personas-decisiones`, `ui-decisiones`, `traspaso-ui-al-analista`, `historias-mvp-olas`) y el prototipo clicable (31 pantallas).

Convención: cada duda lleva **mi propuesta por defecto**. Si Santi responde «de acuerdo con tus propuestas excepto la 3 y la 7», alcanza.

## 1. Dudas e incoherencias

Marcadas con ★ las que bloquean empezar #4 (esqueleto y sistema de diseño). Las demás no bloquean #4, pero conviene cerrarlas ahora para no descubrirlas en la fase de test.

### A. Decisiones de Santi

1. ★ **Tipografía. Resuelta por Santi (23/11): se usa la del prototipo, Manrope.** `ui-decisiones` y el issue #4 decían «tipo Inter»; quedan desactualizados y los corrige el UI/analista. Implementación: Manrope variable autoalojada con `@fontsource-variable/manrope` (licencia OFL), no desde Google Fonts, para que la app cargue sin conexión y sin llamar a un CDN externo. Pesos usados en el prototipo: 400, 500, 600 y 700 (los botones de duración, en 500).
2. ★ **Nombre, ícono y color de la app.** El diseño no los define y la PWA los necesita (nombre corto, ícono 192 y 512 px, ícono «maskable», color de tema, pantalla de arranque). *Santi los entregará más adelante (23/11). Mientras tanto: nombre provisional «Mind», ícono de reemplazo y color de tema `#1E2536`; se cambian en un solo lugar (`manifest`) cuando lleguen.*
3. ★ **Alojamiento de la PWA. Resuelta por Santi (23/11): se sirve desde el mismo servidor de Cloud Run.** Un solo origen y un solo despliegue, sin CORS. Consecuencias: el `Dockerfile` debe construir `web/` y el servidor Fastify servir los archivos estáticos (con `index.html` como respaldo para las rutas de la app y el service worker sin caché agresiva); cada cambio del frontend redespliega el servidor. Ese cambio en el servidor y el `Dockerfile` lo coordino con backend antes de tocarlos.
4. **Código de invitación sin pantalla.** El contrato exige `inviteCode` en `POST /auth/device`, pero ningún tablero ni el prototipo tiene dónde escribirlo (la pantalla «Primer uso» no lo incluye). *Propuesta: Santi abre un enlace con el código en el fragmento (`https://…/#codigo=…`); la app lo lee, lo canjea y lo borra de la dirección. Sin pantalla nueva. Alternativa: un campo en «Primer uso» (requiere diseño).*
5. **Pantalla bloqueada (D11) frente a charla y cierre automático.** La meditación puede seguir con la pantalla bloqueada en Android. La charla en vivo no: con la app en segundo plano el navegador suspende el micrófono. Pero la charla de cierre «arranca sola al terminar la meditación», justo cuando el teléfono puede estar bloqueado. *Propuesta: si la app queda oculta en plena charla, se pausa sola; la charla de cierre solo arranca si la app está visible (si no, se omite sin descontar). Durante la meditación se deja que la pantalla se apague (sin Wake Lock) y se muestran controles en la pantalla de bloqueo con Media Session.*
6. **Instalación.** No hay diseño para «Instalar la app». *Propuesta: sin aviso en la app en el MVP; Santi la instala desde el menú de Chrome en Android.*

### B. Diseño: incoherencias y huecos (UI/UX)

7. **«Abrir ajustes del teléfono» no se puede hacer en una web.** Una PWA no puede abrir los ajustes del sistema (en el prototipo el botón solo simula que el micrófono quedó activo). *Propuesta de cambio: el texto explica dónde activarlo y el botón pasa a «Reintentar», que vuelve a pedir el permiso. Requiere aprobación de Santi y copy del UI.*
8. **Audio no listo, sin estado diseñado.** Tras crear un plan, los audios pueden estar `pendiente` o `generando`; la duración elegida puede no estar descargada; puede no haber conexión o espacio. Es parte del flujo crítico de activación (entrevista → plan → «Empezar sesión 1»). Falta el estado «Preparando tu meditación…», con error y «Reintentar». *Propuesta: reutilizar el patrón de «Armando tu plan…» y el de «Se cortó la conexión»; el UI diseña el copy.*
9. ★ **Estados genéricos sin diseño:** carga (Cloud Run tarda 1 a 3 s en frío), error de red fuera de la charla, lista vacía de planes, aviso de versión nueva. *Propuesta mínima: indicador discreto de carga, mensaje «No pudimos cargar. Reintentar» en línea, y actualizar la app en el siguiente arranque (nunca en medio de una meditación).*
10. **Fin de charla sin pantalla:** `ended` con `inactividad` (5 min sin actividad; ¿cuenta la pausa?), `error` no reintentable y `ended` con `corte` tras agotar reintentos. *Propuesta: reutilizar «Se cortó la conexión» con textos propios.*
11. **Regla de regreso incompleta.** En el prototipo, «‹ Atrás» de «Antes de empezar» y la ✕ del reproductor van siempre al detalle del plan, pero también se llega desde Favoritas (en Planes), y no hay plan de origen. *Propuesta: volver siempre a la pantalla desde la que se abrió.*
12. **✕ en plena meditación.** Sale sin confirmar. ¿Cuenta como hecha (D9 propone «al llegar al final»)? ¿Se retoma? *Propuesta: no cuenta, no se retoma, sin confirmación.*
13. **Sesiones pendientes tocables o no.** `ui-decisiones` dice «cada sesión se puede tocar», el prototipo abre todas, y D10 propone que las futuras no se abran. *Propuesta: tocables las hechas y la siguiente; las pendientes, no (D10).*
14. **Duración y técnicas de un plan.** El diseño muestra «5 sesiones · 10 min» y técnicas como «Respiración lenta, relajación», pero las sesiones del ejemplo mezclan 5, 10 y 15 min, el contrato no tiene duración de plan y `technique` solo admite cinco valores (`respiracion`, `escaneo_corporal`, `atencion_plena`, `visualizacion`, `otra`). *Propuesta: duración típica = mediana de `suggestedMinutes`; técnicas = etiquetas de esos cinco valores (`otra` no se muestra).*
15. ★ **Contraste de los bordes de controles.** Todos los textos pasan AA (mínimo 5,45:1). Pero la línea `#3A4561` mide 1,60:1 sobre el fondo y 1,36:1 sobre las tarjetas, por debajo del 3:1 que pide WCAG 1.4.11 para identificar campos y opciones (campo de texto, selector 5/10/15, opciones de experiencia). *Propuesta: usar `#727B94` (3,07:1 sobre tarjeta, 3,62:1 sobre fondo) solo en el borde de controles interactivos; el resto de líneas queda igual. Es un cambio de diseño: lo decide Santi.*
16. ★ **Movimiento reducido.** El issue pide detener todas las animaciones, pero hoy «escuchando», «hablando» y «en pausa» se distinguen solo por la animación. *Propuesta: línea de voz plana y esfera quieta, con el texto («Habla, te escucho.» / «En pausa») como único indicador. El UI debe confirmarlo.*
17. **Voz del coach y velocidad.** El UX retiró el ajuste «Voz del coach» hasta que backend y frontend lo confirmen. El contrato tiene `voiceSpeed` y el coach lo cambia con la herramienta `ajustar_velocidad`. *Propuesta: sin pantalla en el MVP; el coach es quien lo modifica.*
18. **Sin conexión.** *Propuesta:* marcar favorita y terminar una sesión se guardan en el teléfono y se envían al reconectar (cola de escritura); editar perfil y borrar datos requieren conexión y avisan en línea. Sin diseño nuevo salvo el mensaje.

### C. Contrato y backend

19. **Motivo de fin por cuota:** `src/contract/voice.ts` y `docs/api.md` dicen `cuota_agotada`; `docs/arquitectura.md` (línea 69) dice `quota_exhausted`. Se corrige el documento (el esquema manda). Además, `offline_generation_unavailable` está en `ErrorCodeSchema` pero no en `docs/api.md`: ¿cuándo se devuelve?
20. **Renovación del token.** `arquitectura.md` habla de «un token de renovación», pero el contrato no lo tiene: `/auth/token` recibe `deviceId` + `deviceSecret`. *Entiendo que el secreto queda guardado en el teléfono (IndexedDB) y se usa para renovar. ¿Correcto?*
21. **Zona horaria e idioma al registrarse.** `POST /auth/device` no los recibe y `users.timezone` arranca en `Europe/Rome`; `renewsOn` se calcula en esa zona. *Propuesta: tras registrarse la app hace `PATCH /settings` con la zona del navegador.*
22. **Borrado de datos.** `docs/api.md` dice que borra «todos los datos y audios»; `arquitectura.md` dice que elimina el usuario y todo lo que cuelga (el esquema usa `on delete cascade`, que también borra dispositivos y periodos del bolsón). Eso implica que: (a) la credencial del dispositivo queda inválida y «Continuar → Primer uso» necesitaría un código de invitación nuevo; (b) la propuesta D8 («borrar no reinicia el bolsón») no se puede cumplir con ese esquema. ¿Qué queda vigente después de `DELETE /me/data`? Localmente la app borra IndexedDB, caché de audios y credenciales.
23. **Respuestas sin esquema:** `PUT /sessions/:id/favorite`, `POST /sessions/:id/complete` y `POST /sessions/:id/audio` no definen qué devuelven. ¿`complete` devuelve la sesión y el plan actualizados (al terminar la última, el plan pasa a `completado`)? ¿Es idempotente? Hace falta para sincronizar sin conexión (`completedAt` ya existe en el esquema).
24. **`GET /plans` no alcanza para la pantalla Planes.** Falta el título y los minutos de la próxima sesión («Siguiente: escaneo corporal · 10 min») y la duración del plan. A las favoritas y al reproductor («Soltar la tensión · Sesión 3») les falta el nombre del plan. Sin eso son N+1 llamadas con un límite de 60 por minuto. *Propuesta: `nextSession` en `PlanSummary` y `planName` en `SessionSummary`.*
25. **Audios.** (a) No hay versión (`script_hash` existe en la base pero no en el contrato): si `ajustar_plan` regenera sesiones, el audio descargado queda viejo y la app no puede saberlo. (b) El estado de generación solo se conoce preguntando sesión por sesión; con 60 peticiones por minuto eso no escala. *Propuesta: `scriptHash` en `SessionSummary` y `audioStatus` por duración dentro de `GET /plans/:id`; la app consulta cada 3 s como mínimo.* (c) Política de descarga: *propongo precargar la duración sugerida de todas las sesiones al crearse el plan (≈0,4 MB por minuto: un plan de cinco sesiones de 10 min ocupa ≈20 MB).*
26. **Protocolo de la charla (WebSocket).** Sin definir: tamaño de trama (la PoC usa 100 ms = 2 400 muestras), si hay que esperar `ready` antes de enviar audio, qué hace el servidor con el audio recibido durante `pause`, cuánto tiempo conserva la charla tras un corte («unos segundos»), y qué responde si se pide un ticket con `resumeTalkId` mientras la anterior sigue viva (no hay código de error para «ya hay una charla activa»). El límite de 10 tickets por hora se puede agotar reconectando: la app usará reintentos con espera creciente y un tope.
27. **Eventos y tipos de charla.** `error.code` es texto libre: ¿qué códigos hay y cuáles son reintentables? Tras `professional_help`, ¿la charla sigue? En la entrevista nacen dos planes: ¿llegan dos `plan_created`? Para «Pedir cambios al coach» en «Planes propuestos», ¿qué `talkType` se usa (`plan_nuevo` o `plan`, que exige un `planId`)? `transcript` viaja al teléfono aunque no se muestra (D13): la app lo ignora y nunca lo guarda; ¿se puede no enviarlo?
28. **Calentamiento del servidor.** `arquitectura.md` dice que la app avisa al servidor al abrir el Inicio, sin indicar la ruta. *Propuesta: `GET /v1/version` (no requiere token).*
29. **Documentos del proyecto desactualizados** (a cargo del analista): `historias-mvp-olas` y `traspaso-ui-al-analista` aún presentan D6 como «día 1 de cada mes (propuesta)» y la fecha «1 de diciembre» como regla; Santi ya definió «1 mes desde el primer uso» (`decisiones.md`, 2026-11-23).

## 2. Decisiones técnicas que tomo salvo objeción

| Tema | Decisión |
|---|---|
| Lenguaje | TypeScript, misma versión que el repo (5.x). |
| Ubicación | Carpeta `web/` con su propio `package.json`; importa `src/contract/` por alias, sin moverlo ni tocar el backend. El CI suma typecheck, tests y build de `web/`. |
| Pantalla | Diseñada a 390×844. Se adapta de 360 a 430 px de ancho; en pantallas grandes, una columna centrada de 480 px. Solo vertical. Áreas seguras (muesca y barra de gestos) respetadas. |
| Estilos | Variables CSS para los tokens (`tokens.css`) y CSS Modules. Sin Tailwind: ~15 componentes a medida y cero código en tiempo de ejecución. Modo oscuro único (`color-scheme: dark`). |
| Textos | Catálogo tipado por idioma (`es.ts`; `it.ts` en la fase 2) con un único punto de acceso. Fechas con `Intl`; `renewsOn` (AAAA-MM-DD) se formatea como fecha sin zona, sin desplazarla. |
| Objetivos táctiles | 44 px CSS como mínimo. |
| Datos del servidor | TanStack Query con persistencia en IndexedDB y cola de escrituras sin conexión. |
| Meditación | Elemento `<audio>` (más fiable en segundo plano) con Media Session. Audio m4a descargado una vez y guardado en el teléfono. |
| Voz en vivo | `AudioWorklet` a 24 kHz y WebSocket, reutilizando lo ya probado en la PoC (`src/poc/public/index.html`). Vive en módulos TypeScript puros, fuera del framework. |
| Contrato | Los esquemas zod se importan tal cual. Las respuestas se validan en desarrollo y en tests, no en producción. Aporta ≈26 KB gzip. |
| Barra de progreso | Solo lectura (sin arrastrar), coherente con «sin retroceder ni adelantar». |
| Tests | Vitest + Testing Library + MSW (servidor simulado desde el contrato): integración de navegación (menú visible u oculto, regreso con ✕ y «‹ Atrás»), como pide #4. |

## 3. Propuesta de framework

Requisitos que pesan: PWA instalable en Android (uso diario de Santi) e iPhone; offline (service worker, IndexedDB, audios); audio en tiempo real (la lógica de voz no depende del framework); unas 30 pantallas simples con reglas de navegación (menú inferior oculto en ciertas rutas, regreso al origen); tests de integración de navegación; contrato zod en TypeScript; y que sea mantenible por Santi con ayuda de agentes.

Medido el 2026-11-23 con Vite 8.3.8, una mini-app («contador» con estado) por framework, en producción:

| Opción | Tamaño base (min / gzip / brotli) | Pros | Contras |
|---|---|---|---|
| **React 19.3 + Vite + React Router 8.5** | 250 / 78,5 / 67,8 KB (sin router: 214 / 66,3 / 57,0 KB) | Mayor ecosistema y documentación; los agentes (frontend, tester) generan y depuran código con más fiabilidad. Testing Library y `MemoryRouter` hacen sencillos los tests de navegación pedidos. Rutas con «layout» modelan directamente «menú visible u oculto». `vite-plugin-pwa` 2.0 y TanStack Query maduros. | El más pesado (se descarga una vez; el service worker lo cachea). Los efectos y el modo estricto exigen cuidado con WebSocket y audio: por eso la voz va en módulos puros. Más código repetitivo. |
| **Svelte 5.59 + Vite** | 34 / 13,3 / 12,1 KB | Muy liviano; menos código y animaciones/transiciones integradas (útil para la línea de voz y la esfera); sintaxis cercana a HTML. | Ecosistema menor; las «runas» de Svelte 5 son recientes y los agentes las dominan menos; navegación con historial y tests de navegación requieren más armado propio (SvelteKit es excesivo para una app sin servidor). |
| **Preact 11 + Vite** | 13,5 / 5,7 / 5,2 KB | Misma forma de programar que React con una fracción del tamaño; mismo tooling. | Capa de compatibilidad con librerías de React que a veces falla (router, testing); menos documentación propia. |

Descartados: Next.js y Remix (renderizado en servidor que no se necesita), Ionic y Angular (imponen su propio aspecto y son pesados frente a un diseño a medida), Vue y Solid (válidos, sin ventaja clara aquí). La salida futura de «envolver la web en una app nativa» (limitación de iPhone en `decisiones.md`) funciona igual con cualquiera.

**Recomendación: React 19 + Vite 8 + React Router + `vite-plugin-pwa`.** El tamaño importa poco en una app instalada que carga desde caché; lo que más pesa aquí es poder probar la navegación con herramientas maduras y que todo el equipo de agentes (y las ayudas futuras) trabaje sobre la pila que mejor conoce. **Segunda opción: Svelte 5**, si Santi prioriza una base más liviana y más sencilla de leer para aprender.

## 4. Cómo se midió
- Mini-apps equivalentes (un componente con estado) por framework, `vite build` de producción, tamaños de `assets/*.js` con gzip y brotli de Node.
- Contrato: `src/contract/index.ts` importando once esquemas y llamando a `parse`, mismo build: 89,5 KB minificado / 25,7 KB gzip (zod 4.6.7).
- Contrastes: fórmula WCAG 2.x sobre los colores de `ui-decisiones`.
- Compatibilidad: `vite-plugin-pwa` 2.0.0 admite Vite 8; Vitest 5.1.1 también; Node ≥ 20.19 (el CI usa 22).
- No verificado todavía: audio a 24 kHz y `AudioWorklet` en iPhone (Santi usa Android; en iPhone se probará en #9 y #10), ni el comportamiento exacto del micrófono y del audio con la pantalla bloqueada en el Android de Santi (punto 5): se probará con un prototipo mínimo al arrancar #4 y #9.
