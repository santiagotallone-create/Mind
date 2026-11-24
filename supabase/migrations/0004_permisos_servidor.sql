-- Permisos explícitos para el servidor. Ejecutar después de 0003_charla_en_vivo.sql. Se puede repetir sin romper nada.
--
-- Supabase no siempre le da al rol service_role (la clave de servicio) permiso sobre las tablas creadas desde el editor SQL.
-- Sin esto, el servidor falla con «permission denied for table ...». Solo service_role: anon y authenticated siguen sin acceso
-- (las tablas tienen RLS activado y sin políticas, y la app nunca habla con la base directamente).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lo mismo para las tablas y funciones que se creen en migraciones futuras.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
