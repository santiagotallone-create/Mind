-- Plan de ejemplo para probar la app mientras no existe la generación de planes (#7).
-- Se ejecuta a mano en el editor SQL de Supabase. Es seguro repetirlo:
-- solo crea el plan a las personas que todavía no tienen ninguno.
-- No crea audios: sin audios la app muestra las sesiones pero no puede reproducirlas.

do $$
declare
  u record;
  p uuid;
begin
  for u in
    select id from users
    where not exists (select 1 from plans where plans.user_id = users.id)
  loop
    insert into plans (user_id, name, description)
    values (u.id, 'Plan de ejemplo', 'Cuatro sesiones para probar la app.')
    returning id into p;

    insert into sessions (user_id, plan_id, position, title, technique, suggested_minutes) values
      (u.id, p, 1, 'Respirar y llegar',      'respiracion',      5),
      (u.id, p, 2, 'Escaneo corporal',       'escaneo_corporal', 10),
      (u.id, p, 3, 'Atención a los sonidos', 'atencion_plena',   10),
      (u.id, p, 4, 'Cierre del día',         'respiracion',      15);
  end loop;
end $$;
