-- Historia de planes y sesiones: marcar una sesión como hecha y, si era la última, completar el plan. Es seguro repetirla.
-- Ejecutar después de 0005_registro_zona_horaria.sql.
--
-- Atómica e idempotente: repetirla no cambia la fecha en que se hizo la sesión. Se bloquea la fila del plan antes de
-- mirar las demás sesiones, así dos sesiones terminadas a la vez no se pisan y el plan se completa una sola vez.
create or replace function complete_session(p_user uuid, p_session uuid, p_at timestamptz)
returns boolean
language plpgsql as $$
declare
  v_plan uuid;
begin
  select plan_id into v_plan from sessions where id = p_session and user_id = p_user;
  if not found then
    return false;
  end if;

  perform 1 from plans where id = v_plan for update;

  update sessions set done_at = coalesce(done_at, p_at) where id = p_session;

  update plans
     set status = 'completado', completed_at = coalesce(completed_at, p_at)
   where id = v_plan
     and status = 'activo'
     and not exists (select 1 from sessions s where s.plan_id = v_plan and s.done_at is null);

  return true;
end;
$$;

revoke execute on function complete_session(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function complete_session(uuid, uuid, timestamptz) to service_role;
