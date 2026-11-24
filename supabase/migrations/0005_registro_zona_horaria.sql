-- Dudas FE/BE 19-28 (#21): el registro guarda la zona horaria y el idioma que envía la app.
-- Ejecutar después de 0004_permisos_servidor.sql. Es seguro repetirla.
--
-- La fecha de renovación del bolsón se calcula en la zona horaria de la persona, así que tiene que conocerse desde el primer día.
-- Si la app no manda nada (parámetros null), quedan los valores por defecto de la tabla: Europe/Rome y es.

-- Es una función nueva con cuatro parámetros (sin valores por defecto, para no chocar con la de dos de 0002, que si se vuelve
-- a ejecutar 0002 se recrea y queda sin usar). El servidor siempre llama a la de cuatro.
create or replace function register_device(p_secret_hash text, p_device_name text, p_timezone text, p_locale text)
returns table(new_user_id uuid, new_device_id uuid)
language plpgsql as $$
declare
  v_user uuid;
  v_device uuid;
  v_timezone text := coalesce(p_timezone, 'Europe/Rome');
  v_locale text := coalesce(p_locale, 'es');
begin
  insert into users (timezone, locale) values (v_timezone, v_locale) returning id into v_user;
  insert into profiles (user_id) values (v_user);
  insert into settings (user_id, timezone, locale) values (v_user, v_timezone, v_locale);
  insert into devices (user_id, name, secret_hash) values (v_user, p_device_name, p_secret_hash) returning id into v_device;
  return query select v_user, v_device;
end;
$$;

grant execute on function register_device(text, text, text, text) to service_role;
