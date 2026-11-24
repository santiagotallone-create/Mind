# Frontend de la PWA: revisión previa y propuesta de framework

Historia #4. Documento del agente frontend, escrito **antes de programar**. Estado (24/11): **respondidas por Santi las dudas 1 a 18 (el nombre y el ícono del punto 2 ya están en `web/public/`); framework decidido por delegación (React); pendientes de backend las dudas 19 a 29, que se resuelven en #3**. El esqueleto de #4 está en `web/`. Cuando se aprueben las propuestas, las decisiones firmes pasan a `docs/decisiones.md` y el framework se registra en `docs/arquitectura.md` (sección «Decisiones que siguen abiertas»).

Se revisaron: `docs/arquitectura.md`, `docs/api.md`, `docs/decisiones.md`, `src/contract/` (zod), el issue #4, los documentos del proyecto (`requisitos-mvp`, `ux-personas-decisiones`, `ui-decisiones`, `traspaso-ui-al-analista`, `historias-mvp-olas`) y el prototipo clicable (31 pantallas).

Convención: cada duda lleva **mi propuesta por defecto**. Si Santi responde «de acuerdo con tus propuestas excepto la 3 y la 7», alcanza.

## 1. Dudas e incoherencias

Marcadas con ★ las que bloquean empezar #4 (esqueleto y sistema de diseño). Las demás no bloquean #4, pero conviene cerrarlas ahora para no descubrirlas en la fase de test.

### A. Decisiones de Santi

1. ★ **Tipografía. Resuelta por Santi (23/11): se usa la del prototipo, Manrope.** `ui-decisiones` y el issue #4 decían «tipo Inter»; quedan desactualizados y los corrige el UI/analista. Implementación: Manrope variable autoalojada con `@fontsource-variable/manrope` (licencia OFL), no desde Google Fonts, para que la app cargue sin conexión y sin llamar a un CDN externo. Pesos usados en el prototipo: 400, 500, 600 y 700 (los botones de duración, en 500).
2. ★ **Nombre, ícono y color de la app. Resuelta por Santi (23/11), según `claude/logo-y-nombre-ume.md`: la app se llama «Ume».** Logo «Anochecer» (medio disco salvia sobre dos líneas quietas); colores salvia `#8DB4A7` y azul pizarra `#1E2536` (fondo del ícono y color de tema). Los SVG fuente del documento del proyecto están en `web/public/` (`icons/ume-*.svg`, `favicon.svg`) y los PNG (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`) se generaron con `rsvg-convert` siguiendo los comandos del documento (24/11). Se declaran en el manifest al montar el esqueleto de #4. Cambiar «Mind» por «Ume» en el repositorio y GitHub es decisión de Santi; en la app uso «Ume». Faltan por decidir los textos donde la app se nombra (Inicio o Primer uso).
3. ★ **Alojamiento de la PWA. Resuelta por Santi (23/11): se sirve desde el mismo servidor de Cloud Run.** Un solo origen y un solo despliegue, sin CORS. Consecuencias: el `Dockerfile` debe construir `web/` y el servidor Fastify servir los archivos estáticos (con `index.html` como respaldo para las rutas de la app y el service worker sin caché agresiva); cada cambio del frontend redespliega el servidor. Ese cambio en el servidor y el `Dockerfile` lo coordino con backend antes de tocarlos.
4. **Código de invitación sin pantalla. Resuelta por Santi (23/11): enlace con el código.** Santi abre una vez en su celular `https://<servidor>/#codigo=…`; la app lee el código del fragmento, registra el dispositivo con `POST /auth/device` y lo borra de la dirección (`history.replaceState`). Sin pantalla nueva. Si falta o es inválido, se muestra un mensaje breve de error (copy pendiente del UI). En la fase 2 lo reemplazan las cuentas.
5. **Pantalla bloqueada (D11) frente a charla y cierre automático. Decisión parcial de Santi (23/11): la pantalla no debe bloquearse mientras hay una meditación activa.** Implementación: la app pide al navegador mantener la pantalla encendida (Screen Wake Lock) mientras el reproductor está abierto, y la vuelve a pedir si la app regresa a primer plano (el navegador la libera al ocultarse). Efecto: la charla de cierre puede arrancar sola, porque la app sigue visible al terminar. Quedan dos casos: si el usuario apaga la pantalla a mano o cambia de app, el audio sigue en Android (Media Session con controles en la pantalla de bloqueo) y la charla de cierre se omite sin descontar. Santi confirmó (23/11) que la pantalla también se mantiene encendida durante la charla con el coach, porque necesita la app visible para el micrófono. No verificado todavía en el Android de Santi.
6. **Instalación. Resuelta por Santi (24/11): de acuerdo.** Sin aviso en la app en el MVP; Santi la instala desde el menú de Chrome en Android. El manifest ya declara nombre, íconos y `display: standalone` para que Chrome ofrezca instalarla.

### B. Diseño: incoherencias y huecos (UI/UX)

7. **«Abrir ajustes del teléfono» no se puede hacer en una web. Resuelta por Santi (23/11).** El texto de «Sin acceso al micrófono» explica cómo activar el permiso en Chrome y el botón pasa a «Reintentar», que vuelve a comprobar el permiso. Es un cambio sobre el diseño aprobado: el UI debe actualizar el prototipo y escribir el texto.
8. **Audio no listo. Resuelta por Santi (23/11): fuera del MVP.** No es un escenario factible en el MVP, así que no se diseña esta pantalla. Supuesto de trabajo: una sesión visible en la app tiene su audio disponible.
9. **Estados genéricos (carga, error de red, lista vacía, versión nueva). Resuelta por Santi (23/11): fuera del MVP.** No se diseñan ni se agregan pantallas o mensajes más allá de los ya diseñados.
10. **Fin de charla por inactividad o error no reintentable. Resuelta por Santi (23/11): fuera del MVP.** Sin pantalla nueva.
11. **Regla de regreso. Resuelta por Santi (23/11): está bien como en el prototipo.** «‹ Atrás» de «Antes de empezar» vuelve al detalle del plan; si la sesión se abrió desde Favoritas, al detalle del plan de esa sesión (interpretación mía, con el `planId` de la sesión).
12. **✕ en plena meditación. Resuelta por Santi (24/11, corrección): vuelve al detalle del plan, como en el prototipo.** Si la sesión se abrió desde Favoritas, al detalle del plan de esa sesión (interpretación mía, con el `planId`). Por defecto, sin objeción: no cuenta como hecha, no se retoma y no pide confirmación.
13. **Sesiones pendientes. Resuelta por Santi (23/11): no se pueden tocar.** Se abren las hechas y la siguiente.
14. **Duración y técnicas de un plan. Resuelta por Santi (23/11), según la propuesta:** duración = la más habitual (mediana de `suggestedMinutes`) y técnicas = las etiquetas de los cinco valores del contrato, sin mostrar `otra`.
15. **Contraste de los bordes de controles. Resuelta por Santi (23/11): se aprueba `#727B94`** (3,07:1 sobre tarjeta, 3,62:1 sobre fondo) en el borde de controles interactivos: campo de texto, selector 5/10/15 y opciones de experiencia. Los textos ya pasaban AA (mínimo 5,45:1). El resto de líneas queda igual. El UI debe actualizar el diseño.
16. **Movimiento reducido. Resuelta por Santi (23/11).** Con «reducir movimiento», línea de voz plana y esfera quieta; «escuchando» y «en pausa» se distinguen solo por la animación y por el texto «En pausa», y Santi lo acepta.
17. **Voz del coach y velocidad. Resuelta por Santi (23/11): no está prevista en el MVP.** Sin pantalla de ajuste; el coach cambia la velocidad con su herramienta.
18. **Sin conexión. Resuelta por Santi (23/11), según la propuesta:** marcar favorita y terminar una sesión se guardan en el teléfono y se envían al reconectar; editar perfil y borrar datos requieren conexión y avisan en línea.

### C. Contrato y backend

19. **Motivo de fin por cuota:** `src/contract/voice.ts` y `docs/api.md` dicen `cuota_agotada`; `docs/arquitectura.md` (línea 69) dice `quota_exhausted`. Se corrige el documento (el esquema manda). Además, `offline_generation_unavailable` está en `ErrorCodeSchema` pero no en `docs/api.md`: ¿cuándo se devuelve?
20. **Renovación del token.** `arquitectura.md` habla de «un token de renovación», pero el contrato no lo tiene: `/auth/token` recibe `deviceId` + `deviceSecret`. *Entiendo que el secreto queda guardado en el teléfono (IndexedDB) y se usa para renovar. ¿Correcto?*
21. **Zona horaria e idioma al registrarse.** `POST /auth/device` no los recibe y `users.timezone` arranca en `Europe/Rome`; `renewsOn` se calcula en esa zona. *Propuesta: tras registrarse la app hace `PATCH /settings` con la zona del navegador.*
22. **Borrado de datos. Resuelta por Santi (24/11): opción A.** Se borran perfil, planes, charlas y audios; se conservan el registro del dispositivo y el consumo del bolsón, así que «Continuar → Primer uso» funciona sin código nuevo y el bolsón no se reinicia (D8). Backend debe cambiar `DELETE /me/data` y el esquema (hoy `on delete cascade` borra también dispositivos y periodos del bolsón). Texto original de la duda: `docs/api.md` dice que borra «todos los datos y audios»; `arquitectura.md` dice que elimina el usuario y todo lo que cuelga (el esquema usa `on delete cascade`, que también borra dispositivos y periodos del bolsón). Eso implica que: (a) la credencial del dispositivo queda inválida y «Continuar → Primer uso» necesitaría un código de invitación nuevo; (b) la propuesta D8 («borrar no reinicia el bolsón») no se puede cumplir con ese esquema. ¿Qué queda vigente después de `DELETE /me/data`? Localmente la app borra IndexedDB, caché de audios y credenciales.
23. **Respuestas sin esquema:** `PUT /sessions/:id/favorite`, `POST /sessions/:id/complete` y `POST /sessions/:id/audio` no definen qué devuelven. ¿`complete` devuelve la sesión y el plan actualizados (al terminar la última, el plan pasa a `completado`)? ¿Es idempotente? Hace falta para sincronizar sin conexión (`completedAt` ya existe en el esquema).
24. **`GET /plans` no alcanza para la pantalla Planes.** Falta el título y los minutos de la próxima sesión («Siguiente: escaneo corporal · 10 min») y la duración del plan. A las favoritas y al reproductor («Soltar la tensión · Sesión 3») les falta el nombre del plan. Sin eso son N+1 llamadas con un límite de 60 por minuto. *Propuesta: `nextSession` en `PlanSummary` y `planName` en `SessionSummary`.*
25. **Audios.** (a) No hay versión (`script_hash` existe en la base pero no en el contrato): si `ajustar_plan` regenera sesiones, el audio descargado queda viejo y la app no puede saberlo. (b) El estado de generación solo se conoce preguntando sesión por sesión; con 60 peticiones por minuto eso no escala. *Propuesta: `scriptHash` en `SessionSummary` y `audioStatus` por duración dentro de `GET /plans/:id`; la app consulta cada 3 s como mínimo.* (c) Política de descarga. **Resuelta por Santi (24/11): se precarga al crear el plan.** *Precargar la duración sugerida de todas las sesiones al crearse el plan (≈0,4 MB por minuto: un plan de cinco sesiones de 10 min ocupa ≈20 MB).*
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

## 3. Framework

**Decidido (24/11): React 19 + Vite 8 + React Router 8 + `vite-plugin-pwa`.** Santi delegó la elección («la solución más eficiente y que requiera menos interacciones»). No impacta al backend. Lo que sigue es la comparación que la sustenta.

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


## 5. Esqueleto implementado (historia #4)

Estructura de `web/`: `src/styles` (tokens y estilos globales), `src/i18n` (catálogo `es.ts`, `t()`, formatos con `Intl`), `src/mocks` (datos simulados con los tipos del contrato), `src/components` (Icon, Sphere, VoiceLine, ProgressRing, ProgressBar, Card, Row, Button, CircleButton, DurationSelector, BottomSheet, TextField, FavoriteStar, TabBar, ScreenHeader), `src/app` (rutas, layouts, estado de demo, navegación con origen), `src/screens`, `src/test`.

**Rutas.** Con menú inferior (`TabLayout`): `/`, `/planes`, `/planes/:planId`, `/sesion/:id/antes`, `/yo`, `/yo/perfil`, `/yo/perfil/editar/:campo`, `/yo/ajustes`, `/yo/ajustes/privacidad`. Sin menú (`FullLayout`): `/sesion/:id/reproductor`, `/charla`, `/charla/cierre`, `/entrevista`, `/primer-uso`, `/planes-propuestos`, `/sin-coach`, `/datos-borrados`. En desarrollo, `/mapa` lista todas las pantallas y permite simular bolsón en 0 y sin conexión.

**Regreso.** Charlas y «Coach no disponible» vuelven a la pantalla de origen (`location.state.from`); la charla de cierre vuelve a Planes; la entrevista termina en Planes propuestos; la ✕ del reproductor y «‹ Atrás» de «Antes de empezar» vuelven al detalle del plan; las sesiones pendientes no se tocan.

**Qué es marcador y qué es real.** Real: navegación, layouts, componentes, tokens, catálogo de textos, PWA (manifest, service worker, fuente Manrope latina precacheada), tests. Marcador, cada uno en su historia: voz en vivo (la charla solo alterna «En pausa»), reproductor (sin audio, ni Media Session, ni pantalla encendida; el tiempo es fijo), permiso de micrófono, guardado del perfil, borrado de datos, bolsón y conexión (estado simulado), favoritas.

**Decisiones de implementación.**
- Fuente: `@fontsource-variable/manrope/wght.css`; el service worker precachea solo el subconjunto latino (español e italiano).
- Actualización de la PWA: `registerType: 'prompt'` sin aviso en pantalla; la versión nueva se activa en el siguiente arranque, nunca en medio de una meditación.
- Contraste: borde de controles `#727B94` (3:1), aprobado el 23/11; el prototipo debe actualizarse.
- Duración del plan en las tarjetas: mediana de los minutos sugeridos de sus sesiones (el contrato no trae la duración del plan; ver duda 22).
- Textos provisorios por técnica en «Antes de empezar» (`techniqueIntro`), porque el contrato no trae descripción de la sesión.
- Las pruebas de integración usan un router en memoria (`createAppRouter(initialEntries)`).

**Observaciones de diseño para UI (no se modificó nada).**
- El anillo de «Tus planes» muestra la sesión en curso («3/5» con 2 hechas), mientras que el detalle de un plan completado dice «5 de 5» y el contrato expone `sessionsDone`. Se implementó como el prototipo; conviene confirmar que es lo deseado.
- La esfera lleva una sola cinta ondulada; en el prototipo son dos capas con fases distintas. Implementadas con una onda de dos armónicos de elaboración propia: confirmar con UI.
- En el prototipo el padding superior (48–56 px) cubre la barra de estado simulada; en la PWA real se usa `safe-area-inset-top` más 20 px.
