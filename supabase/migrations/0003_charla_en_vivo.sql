-- Historia #5: charla en vivo con memoria. Ejecutar después de 0002_bolson.sql. Se puede repetir sin romper nada.

-- Transcripción provisoria de la charla. Solo existe hasta generar el resumen interno: al guardar el resumen se borra.
-- No se guarda el audio del usuario (D13).
alter table talks add column if not exists transcript jsonb;

-- Un resumen por charla: guardarlo dos veces no lo duplica.
create unique index if not exists coach_memory_talk_uidx on coach_memory(talk_id);
