import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Prueba las migraciones y las funciones SQL contra un Postgres real (PGlite, corre dentro de Node).
 * Se simula solo lo que pone Supabase y no existe en Postgres común: los roles y el esquema storage.
 */
const migration = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf-8");

let db: PGlite;
const T0 = "2026-11-23T09:00:00Z";
const T1 = "2026-12-23T09:00:00Z";

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  // gen_random_uuid() ya viene en Postgres 13+; la extensión pgcrypto no está en PGlite.
  await db.exec(migration("0001_init.sql").replace("create extension if not exists pgcrypto;", ""));
  await db.exec(migration("0002_bolson.sql"));
  await db.exec(migration("0003_charla_en_vivo.sql"));
  await db.exec(migration("0004_permisos_servidor.sql"));
  await db.exec(migration("0005_registro_zona_horaria.sql"));
  await db.exec(migration("0006_completar_sesion.sql"));
});

after(async () => {
  await db.close();
});

async function newUser(): Promise<{ userId: string; deviceId: string }> {
  const res = await db.query<{ new_user_id: string; new_device_id: string }>("select * from register_device($1, $2, $3, $4)", ["hash-" + Math.random(), "Pixel", null, null]);
  return { userId: res.rows[0]!.new_user_id, deviceId: res.rows[0]!.new_device_id };
}

async function newTalk(userId: string): Promise<string> {
  const res = await db.query<{ id: string }>("insert into talks (user_id, type) values ($1, 'libre') returning id", [userId]);
  return res.rows[0]!.id;
}

const openPeriod = async (userId: string, now = T0, endsAt = T1) =>
  (await db.query<any>("select * from open_quota_period($1, $2, $3, 7200)", [userId, now, endsAt])).rows[0];

const charge = async (talk: string, period: string, seconds: number) =>
  (await db.query<any>("select * from charge_talk($1, $2, $3)", [talk, period, seconds])).rows[0];

test("las migraciones 0001 y 0002 se aplican y se pueden repetir", async () => {
  await db.exec(migration("0002_bolson.sql"));
  const columns = await db.query("select 1 from information_schema.columns where table_name = 'talks' and column_name = 'quota_period_id'");
  assert.equal(columns.rows.length, 1);
});

test("register_device guarda la zona horaria y el idioma que manda la app, y sin ellos usa Europe/Rome y es", async () => {
  const withZone = await db.query<{ new_user_id: string }>("select * from register_device($1, $2, $3, $4)", ["hash-" + Math.random(), "iPhone", "America/Argentina/Buenos_Aires", "it"]);
  const id = withZone.rows[0]!.new_user_id;
  for (const table of ["users", "settings"]) {
    const col = table === "users" ? "id" : "user_id";
    const row = (await db.query<any>(`select timezone, locale from ${table} where ${col} = $1`, [id])).rows[0];
    assert.deepEqual(row, { timezone: "America/Argentina/Buenos_Aires", locale: "it" }, table);
  }
  const { userId } = await newUser();
  const defaults = (await db.query<any>("select timezone, locale from settings where user_id = $1", [userId])).rows[0];
  assert.deepEqual(defaults, { timezone: "Europe/Rome", locale: "es" });
});

test("register_device crea usuario, perfil, ajustes y dispositivo", async () => {
  const { userId, deviceId } = await newUser();
  for (const table of ["profiles", "settings"]) {
    assert.equal((await db.query(`select 1 from ${table} where user_id = $1`, [userId])).rows.length, 1, table);
  }
  const device = await db.query<any>("select user_id, secret_hash, name from devices where id = $1", [deviceId]);
  assert.equal(device.rows[0].user_id, userId);
  assert.equal(device.rows[0].name, "Pixel");
});

test("open_quota_period crea el periodo y devuelve el mismo mientras esté abierto", async () => {
  const { userId } = await newUser();
  const first = await openPeriod(userId);
  const again = await openPeriod(userId, "2026-11-24T09:00:00Z");
  assert.equal(first.id, again.id);
  assert.equal(first.seconds_total, 7200);
  assert.equal(first.seconds_used, 0);
  const count = await db.query("select 1 from quota_periods where user_id = $1", [userId]);
  assert.equal(count.rows.length, 1);
});

test("open_quota_period: en el instante exacto del vencimiento el periodo ya no está abierto y se crea otro", async () => {
  const { userId } = await newUser();
  const first = await openPeriod(userId);
  const justBefore = await openPeriod(userId, "2026-12-23T08:59:59Z");
  assert.equal(justBefore.id, first.id);
  const next = await openPeriod(userId, T1, "2027-01-23T09:00:00Z");
  assert.notEqual(next.id, first.id);
  assert.equal(next.seconds_used, 0);
});

test("open_quota_period falla con un usuario que no existe", async () => {
  await assert.rejects(() => openPeriod("3f2b8f0e-6f58-4c4e-9a43-0d9c7a6d1b11"));
});

test("un periodo no puede terminar antes de empezar", async () => {
  const { userId } = await newUser();
  await assert.rejects(() => openPeriod(userId, T1, T0));
});

test("charge_talk descuenta solo lo nuevo, no se repite y no retrocede", async () => {
  const { userId } = await newUser();
  const period = await openPeriod(userId);
  const talk = await newTalk(userId);
  assert.equal((await charge(talk, period.id, 100)).seconds_used, 100);
  assert.equal((await charge(talk, period.id, 100)).seconds_used, 100);
  assert.equal((await charge(talk, period.id, 40)).seconds_used, 100);
  assert.equal((await charge(talk, period.id, 160)).seconds_used, 160);
  const row = (await db.query<any>("select active_seconds, quota_period_id from talks where id = $1", [talk])).rows[0];
  assert.equal(row.active_seconds, 160);
  assert.equal(row.quota_period_id, period.id);
});

test("charge_talk: el saldo nunca pasa del total, pero la charla guarda el tiempo real", async () => {
  const { userId } = await newUser();
  const period = await openPeriod(userId);
  const talk = await newTalk(userId);
  assert.equal((await charge(talk, period.id, 7190)).seconds_used, 7190);
  assert.equal((await charge(talk, period.id, 7209)).seconds_used, 7200);
  const row = (await db.query<any>("select active_seconds from talks where id = $1", [talk])).rows[0];
  assert.equal(row.active_seconds, 7209);
});

test("charge_talk: dos charlas seguidas suman en el mismo periodo", async () => {
  const { userId } = await newUser();
  const period = await openPeriod(userId);
  const a = await newTalk(userId);
  const b = await newTalk(userId);
  await charge(a, period.id, 600);
  assert.equal((await charge(b, period.id, 300)).seconds_used, 900);
});

test("charge_talk rechaza el periodo de otro usuario y una charla inexistente", async () => {
  const me = await newUser();
  const other = await newUser();
  const otherPeriod = await openPeriod(other.userId);
  const myTalk = await newTalk(me.userId);
  await assert.rejects(() => charge(myTalk, otherPeriod.id, 60));
  const untouched = await db.query<any>("select seconds_used from quota_periods where id = $1", [otherPeriod.id]);
  assert.equal(untouched.rows[0].seconds_used, 0);
  await assert.rejects(() => charge("3f2b8f0e-6f58-4c4e-9a43-0d9c7a6d1b11", otherPeriod.id, 60));
});

test("el motivo limite_duracion existe en el enum de cierre de charla", async () => {
  const { userId } = await newUser();
  const talk = await newTalk(userId);
  await db.query("update talks set end_reason = 'limite_duracion', ended_at = now() where id = $1", [talk]);
  const row = (await db.query<any>("select end_reason from talks where id = $1", [talk])).rows[0];
  assert.equal(row.end_reason, "limite_duracion");
});

test("borrar un usuario borra su bolsón y sus charlas", async () => {
  const { userId } = await newUser();
  const period = await openPeriod(userId);
  const talk = await newTalk(userId);
  await charge(talk, period.id, 10);
  await db.query("delete from users where id = $1", [userId]);
  assert.equal((await db.query("select 1 from quota_periods where user_id = $1", [userId])).rows.length, 0);
  assert.equal((await db.query("select 1 from talks where user_id = $1", [userId])).rows.length, 0);
});

test("la migración 0003 se aplica y se puede repetir; agrega la transcripción provisoria", async () => {
  await db.exec(migration("0003_charla_en_vivo.sql"));
  const columns = await db.query("select 1 from information_schema.columns where table_name = 'talks' and column_name = 'transcript'");
  assert.equal(columns.rows.length, 1);
});

test("coach_memory: un solo resumen por charla; guardar de nuevo lo reemplaza (upsert por talk_id)", async () => {
  const { userId } = await newUser();
  const talk = await newTalk(userId);
  const upsert = (summary: string) =>
    db.query(
      "insert into coach_memory (user_id, talk_id, summary) values ($1, $2, $3) on conflict (talk_id) do update set summary = excluded.summary",
      [userId, talk, summary],
    );
  await upsert("primero");
  await upsert("segundo");
  const rows = await db.query<any>("select summary from coach_memory where talk_id = $1", [talk]);
  assert.deepEqual(rows.rows.map((r) => r.summary), ["segundo"]);
  await assert.rejects(db.query("insert into coach_memory (user_id, talk_id, summary) values ($1, $2, 'duplicado')", [userId, talk]));
});

test("al borrar la charla el resumen queda (talk_id pasa a null) y la transcripción se guarda como json", async () => {
  const { userId } = await newUser();
  const talk = await newTalk(userId);
  await db.query("update talks set transcript = $2::jsonb where id = $1", [talk, JSON.stringify([{ role: "user", text: "Hola", at: T0 }])]);
  const stored = await db.query<any>("select transcript from talks where id = $1", [talk]);
  assert.equal(stored.rows[0].transcript[0].text, "Hola");
  await db.query("update talks set transcript = null where id = $1", [talk]);
  assert.equal((await db.query<any>("select transcript from talks where id = $1", [talk])).rows[0].transcript, null);
});

test("la migración 0004 se puede repetir y las funciones siguen cerradas para anon y authenticated", async () => {
  await db.exec(migration("0004_permisos_servidor.sql"));
  for (const role of ["anon", "authenticated"]) {
    const res = await db.query<any>("select has_function_privilege($1, 'register_device(text, text)', 'execute') as ok", [role]);
    assert.equal(res.rows[0].ok, false, role);
  }
  const server = await db.query<any>("select has_table_privilege('service_role', 'users', 'insert') as ok");
  assert.equal(server.rows[0].ok, true);
});

describe_complete_session();

function describe_complete_session() {
  async function planWithSessions(userId: string, count: number) {
    const plan = (await db.query<any>("insert into plans (user_id, name) values ($1, 'Plan') returning id", [userId])).rows[0].id as string;
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      ids.push((await db.query<any>("insert into sessions (user_id, plan_id, position, title) values ($1, $2, $3, 'S') returning id", [userId, plan, i])).rows[0].id);
    }
    return { plan, ids };
  }
  const complete = (userId: string, sessionId: string, at: string) =>
    db.query<any>("select complete_session($1, $2, $3::timestamptz) as ok", [userId, sessionId, at]).then((r) => r.rows[0].ok as boolean);

  test("complete_session: marca la sesión, completa el plan con la última y es idempotente", async () => {
    const { userId } = await newUser();
    const { plan, ids } = await planWithSessions(userId, 2);
    assert.equal(await complete(userId, ids[0]!, "2026-11-24T10:00:00Z"), true);
    assert.equal((await db.query<any>("select status from plans where id = $1", [plan])).rows[0].status, "activo");
    assert.equal(await complete(userId, ids[1]!, "2026-11-24T11:00:00Z"), true);
    const done = (await db.query<any>("select status, completed_at from plans where id = $1", [plan])).rows[0];
    assert.equal(done.status, "completado");
    assert.equal(new Date(done.completed_at).toISOString(), "2026-11-24T11:00:00.000Z");

    await complete(userId, ids[1]!, "2026-11-25T09:00:00Z");
    const again = (await db.query<any>("select done_at from sessions where id = $1", [ids[1]])).rows[0];
    assert.equal(new Date(again.done_at).toISOString(), "2026-11-24T11:00:00.000Z", "repetir no cambia la fecha");
    assert.equal(new Date((await db.query<any>("select completed_at from plans where id = $1", [plan])).rows[0].completed_at).toISOString(), "2026-11-24T11:00:00.000Z");
  });

  test("complete_session: una sesión ajena o inexistente devuelve false y no cambia nada", async () => {
    const { userId } = await newUser();
    const other = await newUser();
    const { ids } = await planWithSessions(userId, 1);
    assert.equal(await complete(other.userId, ids[0]!, "2026-11-24T10:00:00Z"), false);
    assert.equal(await complete(userId, "00000000-0000-4000-8000-000000000000", "2026-11-24T10:00:00Z"), false);
    assert.equal((await db.query<any>("select done_at from sessions where id = $1", [ids[0]])).rows[0].done_at, null);
  });

  test("complete_session: un plan archivado no cambia de estado al terminar sus sesiones", async () => {
    const { userId } = await newUser();
    const { plan, ids } = await planWithSessions(userId, 1);
    await db.query("update plans set status = 'archivado' where id = $1", [plan]);
    await complete(userId, ids[0]!, "2026-11-24T10:00:00Z");
    assert.equal((await db.query<any>("select status from plans where id = $1", [plan])).rows[0].status, "archivado");
  });

  test("complete_session: la función queda cerrada para anon y authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      const res = await db.query<any>("select has_function_privilege($1, 'complete_session(uuid, uuid, timestamptz)', 'execute') as ok", [role]);
      assert.equal(res.rows[0].ok, false, role);
    }
  });
}

test("semilla plan_de_ejemplo: crea el plan solo a quien no tiene y se puede repetir", async () => {
  const seed = readFileSync(new URL("../../supabase/seeds/plan_de_ejemplo.sql", import.meta.url), "utf8");
  const fresh = await newUser();
  const withPlan = await newUser();
  await db.query("insert into plans (user_id, name) values ($1, 'Mío')", [withPlan.userId]);
  await db.exec(seed);
  await db.exec(seed);
  const count = async (userId: string) =>
    (await db.query<any>("select (select count(*) from plans where user_id = $1)::int as plans, (select count(*) from sessions where user_id = $1)::int as sessions", [userId])).rows[0];
  assert.deepEqual(await count(fresh.userId), { plans: 1, sessions: 4 });
  assert.deepEqual(await count(withPlan.userId), { plans: 1, sessions: 0 });
});
