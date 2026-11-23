# Despliegue mínimo (gratuito)

Historia #3. Estos pasos los hace Santi porque necesitan sus cuentas. Costo esperado: 0 EUR de infraestructura más la voz de OpenAI. Los límites de las capas gratuitas cambian: revisar las páginas de precios de Google Cloud y Supabase antes de empezar.

## 1. Supabase (base de datos y audios)
1. Crear un proyecto gratuito en supabase.com (región de Europa).
2. En el editor SQL, ejecutar `supabase/migrations/0001_init.sql`.
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

- `--max-instances 1` limita el costo y simplifica la medición del bolsón.
- `--timeout 3600` permite charlas largas por WebSocket.
- Los secretos se crean antes en Secret Manager.
- `--allow-unauthenticated` es necesario para que la app llegue al servidor; la protección está en el código de invitación y los tokens.

## 3. Comprobación
- `GET https://<url-del-servidor>/healthz` debe responder `{"status":"ok"}`.

## 4. La app (PWA)
El alojamiento de la PWA se decide en la historia #4 con el framework elegido por el frontend. Opciones sin costo: servirla desde el mismo servidor o desde una web estática gratuita.
