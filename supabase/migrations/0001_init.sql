-- Historia #3: modelo de datos del MVP.
-- Todas las tablas pertenecen a un usuario (user_id). El servidor usa la clave de servicio y filtra siempre por user_id.
-- RLS activo y sin políticas: cualquier acceso directo con la clave pública queda denegado (defensa en profundidad).

create extension if not exists pgcrypto;

create type experience_level as enum ('principiante', 'algo_practica', 'mucha_practica');
create type plan_status as enum ('activo', 'completado', 'archivado');
create type plan_origin as enum ('coach', 'usuario');
create type meditation_technique as enum ('respiracion', 'escaneo_corporal', 'atencion_plena', 'visualizacion', 'otra');
create type audio_status as enum ('pendiente', 'generando', 'lista', 'error');
create type talk_type as enum ('libre', 'entrevista', 'cierre', 'plan', 'meditacion', 'plan_nuevo');
create type talk_end_reason as enum ('usuario', 'cuota_agotada', 'corte', 'error', 'inactividad');

create table users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  locale text not null default 'es' check (locale in ('es', 'it')),
  timezone text not null default 'Europe/Rome'
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index devices_user_idx on devices(user_id);

create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  goals text not null default '',
  experience experience_level,
  current_state text not null default '',
  interview_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  status plan_status not null default 'activo',
  created_by plan_origin not null default 'coach',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index plans_user_idx on plans(user_id, status);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  position int not null check (position >= 1),
  title text not null,
  technique meditation_technique not null default 'otra',
  suggested_minutes int not null default 10 check (suggested_minutes in (5, 10, 15)),
  script text,
  done_at timestamptz,
  favorite boolean not null default false,
  unique (plan_id, position)
);
create index sessions_user_idx on sessions(user_id);
create index sessions_favorite_idx on sessions(user_id) where favorite;

create table session_audios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  minutes int not null check (minutes in (5, 10, 15)),
  status audio_status not null default 'pendiente',
  storage_path text,
  format text not null default 'm4a',
  bytes bigint,
  duration_seconds int,
  script_hash text,
  error text,
  created_at timestamptz not null default now(),
  unique (session_id, minutes)
);
create index session_audios_user_idx on session_audios(user_id);

create table talks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type talk_type not null,
  plan_id uuid references plans(id) on delete set null,
  session_id uuid references sessions(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds int not null default 0 check (active_seconds >= 0),
  end_reason talk_end_reason,
  model text,
  metrics jsonb not null default '{}'::jsonb
);
create index talks_user_idx on talks(user_id, started_at);

-- Memoria interna del coach. Nunca se expone por la API: solo el servidor la lee para armar la charla siguiente.
create table coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  talk_id uuid references talks(id) on delete set null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index coach_memory_user_idx on coach_memory(user_id, created_at);

-- Bolsón: el periodo empieza en el primer uso y dura 1 mes (ver docs/arquitectura.md).
create table quota_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  seconds_total int not null default 7200,
  seconds_used int not null default 0 check (seconds_used >= 0),
  unique (user_id, starts_at)
);
create index quota_periods_user_idx on quota_periods(user_id, starts_at);

create table settings (
  user_id uuid primary key references users(id) on delete cascade,
  locale text not null default 'es' check (locale in ('es', 'it')),
  timezone text not null default 'Europe/Rome',
  voice_speed numeric(3, 2) not null default 1.00 check (voice_speed between 0.5 and 1.5)
);

-- Tickets de voz de un solo uso (60 s).
create table voice_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  talk_id uuid not null references talks(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Denegar todo por defecto a los roles públicos: solo el servidor (clave de servicio) accede.
alter table users enable row level security;
alter table devices enable row level security;
alter table profiles enable row level security;
alter table plans enable row level security;
alter table sessions enable row level security;
alter table session_audios enable row level security;
alter table talks enable row level security;
alter table coach_memory enable row level security;
alter table quota_periods enable row level security;
alter table settings enable row level security;
alter table voice_tickets enable row level security;

-- Bucket privado para los audios: ruta {user_id}/{session_id}/{minutes}.m4a
insert into storage.buckets (id, name, public) values ('meditaciones', 'meditaciones', false)
on conflict (id) do nothing;
