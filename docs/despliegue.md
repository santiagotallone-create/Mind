# Despliegue mínimo (gratuito)

Historia #3. Estos pasos los hace Santi porque necesitan sus cuentas. Costo esperado: 0 EUR de infraestructura más la voz de OpenAI. Los límites de las capas gratuitas cambian: revisar las páginas de precios de Google Cloud y Supabase antes de empezar.

## 1. Supabase (base de datos y audios)
1. Crear un proyecto gratuito en supabase.com (región de Europa).
2. En el editor SQL, ejecutar `supabase/migrations/0001_init.sql` y después, en orden, cada migración nueva (`0002_bolson.sql`, `0003_charla_en_vivo.sql`, `0004_permisos_servidor.sql`, `0005_registro_zona_horaria.sql`, `0006_completar_sesion.sql`, ...). Las migraciones se pueden repetir sin romper nada. **Hay que ejecutar `0002_bolson.sql` antes de desplegar la historia #6 y `0003_charla_en_vivo.sql` antes de la #5**: el servidor usa lo que crean. **`0004_permisos_servidor.sql` es necesaria si el servidor responde `permission denied for table ...`**: da permisos al rol del servidor. **`0005` hace falta para que la app envíe `timezone` al registrarse y `0006` para las rutas de planes** (`POST /sessions/:id/complete`). Para probar sin planes reales, ejecutar después `supabase/seeds/plan_de_ejemplo.sql` (crea un plan de ejemplo a quien no tenga ninguno; se puede repetir).
3. Copiar la URL del proyecto y la **clave de servicio** (Settings → API). La clave de servicio nunca va en la app ni en el repositorio.
4. Los proyectos gratuitos se pausan tras una semana sin actividad. La historia #3 deja pendiente un ping semanal automático (GitHub Actions) para evitarlo; hasta entonces, abrir la app al menos una vez por semana.

## 2. Google Cloud Run (servidor)
Requiere una cuenta de Google Cloud con tarjeta (la capa gratuita no cobra dentro de sus límites, pero un presupuesto por sí solo no frena el gasto: crear una alerta de presupuesto de 1 EUR).

```
gcloud run deploy mind-server \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 3600 \
  --set-secrets OPENAI_API_KEY=openai-key:latest,INVITE_CODE=invite-code:latest,JWT_SECRET=jwt-secret:latest,SUPABASE_SERVICE_KEY=supabase-service-key:latest \
  --set-env-vars SUPABASE_URL=https://TU-PROYECTO.supabase.co
```

- Cuando se conozca la dirección de la PWA, agregar `ALLOWED_ORIGINS=https://tu-pwa` (varias, separadas por coma) a `--set-env-vars`; sin esa variable el navegador no puede llamar a la API desde otro origen. `PUBLIC_URL=https://la-url-del-servidor` es opcional: fija la dirección que se entrega en `wsUrl` (si falta, se arma con la petición).
- `OPENAI_SUMMARY_MODEL` (opcional, por defecto `gpt-4.1-mini`) es el modelo de texto que resume cada charla. Si OpenAI lo rechaza, las charlas funcionan igual, pero no se generan resúmenes (se ve en los logs).
- `--max-instances 1` limita el costo y simplifica la medición del bolsón.
- `--timeout 3600` permite charlas largas por WebSocket.
- Los secretos se crean antes en Secret Manager.
- `--allow-unauthenticated` es necesario para que la app llegue al servidor; la protección está en el código de invitación y los tokens.

### Si el despliegue falla con «does not have storage.objects.get access»
En proyectos nuevos la cuenta de servicio de Compute Engine no puede leer el código fuente. Se arregla una vez (sustituir el ID y el número del proyecto, que aparece en el mensaje de error):
```
gcloud projects add-iam-policy-binding ID-DEL-PROYECTO --member=serviceAccount:NUMERO-DEL-PROYECTO-compute@developer.gserviceaccount.com --role=roles/cloudbuild.builds.builder
gcloud projects add-iam-policy-binding ID-DEL-PROYECTO --member=serviceAccount:NUMERO-DEL-PROYECTO-compute@developer.gserviceaccount.com --role=roles/storage.objectViewer
```
Esperar un minuto y repetir el despliegue. Si `gcloud services enable` da error 429, esperar un minuto y repetirlo. Pegar los comandos de a una línea.

## 3. Comprobación
- `GET https://<url-del-servidor>/health` debe responder `{"status":"ok"}`. No usar `/healthz`: Cloud Run reserva esa ruta y responde 404 sin llegar al servidor.
- Con una charla real: medir el costo comparándolo con el uso de la cuenta de OpenAI y registrar una charla de unos 10 minutos con el modelo mini (seguimiento pendiente de la prueba de concepto).

## 4. La app (PWA)
El alojamiento de la PWA se decide en la historia #4 con el framework elegido por el frontend. Opciones sin costo: servirla desde el mismo servidor o desde una web estática gratuita.
