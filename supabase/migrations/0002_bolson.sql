-- Historia #6: bolsón de coaching. Ejecutar en el editor SQL de Supabase después de 0001_init.sql.
-- Es seguro repetirla: todo usa "if not exists" o "create or replace".

-- 1) Motivo de cierre nuevo: la charla llegó al tope de 30 minutos continuos.
alter type talk_end_reason add value if not exists 'limite_duracion';

-- 2) Cada charla recuerda en qué periodo del bolsón se descontó (el periodo en que empezó).
alter table talks add column if not exists quota_period_id uuid references quota_periods(id) on delete set null;
create index if not exists talks_period_idx on talks(quota_period_id);

-- 3) Registro de un dispositivo nuevo: crea usuario, perfil, ajustes y dispositivo en un solo paso.
create or replace function register_device(p_secret_hash text, p_device_name text)
returns table(new_user_id uuid, new_device_id uuid)
language plpgsql as $$
declare
  v_user uuid;
  v_device uuid;
begin
  insert into users default values returning id into v_user;
  insert into profiles (user_id) values (v_user);
  insert into settings (user_id) values (v_user);
  insert into devices (user_id, name, secret_hash) values (v_user, p_device_name, p_secret_hash) returning id into v_device;
  return query select v_user, v_device;
end;
$$;

-- 4) Abre el periodo del bolsón, o devuelve el que ya está abierto. Se serializa por usuario para que
--    dos activaciones simultáneas no creen dos periodos.
create or replace function open_quota_period(p_user uuid, p_now timestamptz, p_ends_at timestamptz, p_seconds_total int)
returns setof quota_periods
language plpgsql as $$
declare
  v_period quota_periods;
begin
  perform 1 from users where id = p_user for update;
  if not found then
    raise exception 'usuario % no existe', p_user using errcode = 'P0002';
  end if;
  select * into v_period from quota_periods
    where user_id = p_user and starts_at <= p_now and ends_at > p_now
    order by starts_at desc limit 1;
  if not found then
    insert into quota_periods (user_id, starts_at, ends_at, seconds_total)
      values (p_user, p_now, p_ends_at, p_seconds_total)
      returning * into v_period;
  end if;
  return next v_period;
end;
$$;

-- 5) Descuenta el tiempo activo de una charla. Idempotente y monótono: solo se descuenta lo nuevo,
--    repetir la llamada no descuenta de más y el saldo nunca pasa del total del periodo.
create or replace function charge_talk(p_talk uuid, p_period uuid, p_active_seconds int)
returns quota_periods
language plpgsql as $$
declare
  v_talk_user uuid;
  v_previous int;
  v_delta int;
  v_period quota_periods;
begin
  select user_id, active_seconds into v_talk_user, v_previous from talks where id = p_talk for update;
  if not found then
    raise exception 'charla % no existe', p_talk using errcode = 'P0002';
  end if;
  v_delta := greatest(0, p_active_seconds - v_previous);
  update quota_periods
    set seconds_used = least(seconds_total, seconds_used + v_delta)
    where id = p_period and user_id = v_talk_user
    returning * into v_period;
  if not found then
    raise exception 'periodo % no existe o es de otro usuario', p_period using errcode = 'P0002';
  end if;
  update talks
    set active_seconds = greatest(active_seconds, p_active_seconds),
        quota_period_id = coalesce(quota_period_id, p_period)
    where id = p_talk;
  return v_period;
end;
$$;

-- Estas funciones solo las llama el servidor con la clave de servicio.
revoke execute on function register_device(text, text) from public, anon, authenticated;
revoke execute on function open_quota_period(uuid, timestamptz, timestamptz, int) from public, anon, authenticated;
revoke execute on function charge_talk(uuid, uuid, int) from public, anon, authenticated;
grant execute on function register_device(text, text) to service_role;
grant execute on function open_quota_period(uuid, timestamptz, timestamptz, int) to service_role;
grant execute on function charge_talk(uuid, uuid, int) to service_role;
