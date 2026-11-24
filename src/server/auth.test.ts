import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { MemoryStore } from "../store/memory.js";
import { bearer, FakeClock, newDeviceSecret, registerDevice, testEnv } from "../testing/helpers.js";
import { buildApp } from "./app.js";
import { hashSecret } from "./tokens.js";

function setup(envOverrides = {}) {
  const clock = new FakeClock(new Date("2026-11-23T10:00:00+01:00"));
  const store = new MemoryStore();
  const app = buildApp({ env: testEnv(envOverrides), store, clock: clock.now });
  return { app, store, clock };
}

const register = (app: ReturnType<typeof setup>["app"], payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: "/v1/auth/device", payload: payload as object, headers });

test("el registro con código válido devuelve token y dispositivo, y guarda solo el hash del secreto", async () => {
  const { app, store } = setup();
  const deviceSecret = newDeviceSecret();
  const res = await register(app, { inviteCode: "codigo-de-prueba", deviceSecret, deviceName: "Pixel" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.expiresInSeconds, 900);
  assert.ok(body.accessToken && body.deviceId);
  const stored = store.devices.get(body.deviceId)!;
  assert.notEqual(stored.secretHash, deviceSecret);
  assert.equal(stored.secretHash, hashSecret(deviceSecret));
  assert.equal(JSON.stringify([...store.devices.values()]).includes(deviceSecret), false);
});

test("sin código de invitación válido no hay registro", async () => {
  const { app, store } = setup();
  const res = await register(app, { inviteCode: "otro", deviceSecret: newDeviceSecret() });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error.code, "invalid_invite");
  assert.equal(store.users.size, 0);
});

test("si el servidor no tiene código configurado nadie puede registrarse, ni con código vacío", async () => {
  const { app, store } = setup({ inviteCode: "" });
  for (const inviteCode of ["", "cualquiera"]) {
    const res = await register(app, { inviteCode, deviceSecret: newDeviceSecret() });
    assert.ok(res.statusCode === 400 || res.statusCode === 403);
  }
  assert.equal(store.users.size, 0);
});

test("el registro valida lo que entra con el contrato", async () => {
  const { app } = setup();
  const cases = [{}, { inviteCode: "codigo-de-prueba" }, { inviteCode: "codigo-de-prueba", deviceSecret: "corto" }, undefined];
  for (const payload of cases) {
    const res = await register(app, payload);
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, "invalid_request");
  }
  const malformed = await app.inject({ method: "POST", url: "/v1/auth/device", payload: "{no es json", headers: { "content-type": "application/json" } });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, "invalid_request");
});

test("un cuerpo demasiado grande se rechaza", async () => {
  const { app } = setup();
  const res = await register(app, { inviteCode: "x".repeat(70 * 1024), deviceSecret: newDeviceSecret() });
  assert.equal(res.statusCode, 413);
  assert.equal(res.json().error.code, "invalid_request");
});

test("registro: máximo 5 intentos por hora y dirección IP, incluidos los fallidos", async () => {
  const { app, clock } = setup();
  for (let i = 0; i < 5; i++) {
    assert.equal((await register(app, { inviteCode: "mal", deviceSecret: newDeviceSecret() })).statusCode, 403);
  }
  const blocked = await register(app, { inviteCode: "codigo-de-prueba", deviceSecret: newDeviceSecret() });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error.code, "rate_limited");
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  clock.advanceSeconds(3601);
  assert.equal((await register(app, { inviteCode: "codigo-de-prueba", deviceSecret: newDeviceSecret() })).statusCode, 200);
});

test("el límite de registro es por IP: otra IP no queda bloqueada", async () => {
  const { app } = setup();
  for (let i = 0; i < 5; i++) await app.inject({ method: "POST", url: "/v1/auth/device", payload: { inviteCode: "mal", deviceSecret: newDeviceSecret() }, remoteAddress: "10.0.0.1" });
  const other = await app.inject({ method: "POST", url: "/v1/auth/device", payload: { inviteCode: "codigo-de-prueba", deviceSecret: newDeviceSecret() }, remoteAddress: "10.0.0.2" });
  assert.equal(other.statusCode, 200);
});

test("X-Forwarded-For no sirve para saltarse el límite si no hay proxy de confianza", async () => {
  const { app } = setup({ trustProxyHops: 0 });
  for (let i = 0; i < 5; i++) {
    await register(app, { inviteCode: "mal", deviceSecret: newDeviceSecret() }, { "x-forwarded-for": `1.2.3.${i}` });
  }
  const res = await register(app, { inviteCode: "codigo-de-prueba", deviceSecret: newDeviceSecret() }, { "x-forwarded-for": "9.9.9.9" });
  assert.equal(res.statusCode, 429);
});

test("detrás de Cloud Run se usa la IP que agregó el proxy, no la que escribe el cliente", async () => {
  const { app } = setup({ trustProxyHops: 1 });
  // El cliente escribe una IP distinta cada vez al principio; el proxy agrega al final la real (la misma).
  for (let i = 0; i < 5; i++) {
    await register(app, { inviteCode: "mal", deviceSecret: newDeviceSecret() }, { "x-forwarded-for": `6.6.6.${i}, 203.0.113.7` });
  }
  const res = await register(app, { inviteCode: "codigo-de-prueba", deviceSecret: newDeviceSecret() }, { "x-forwarded-for": "7.7.7.7, 203.0.113.7" });
  assert.equal(res.statusCode, 429);
});

test("renovar el token con las credenciales del dispositivo", async () => {
  const { app } = setup();
  const device = await registerDevice(app);
  const res = await app.inject({ method: "POST", url: "/v1/auth/token", payload: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().deviceId, device.deviceId);
  const quota = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(res.json().accessToken) });
  assert.equal(quota.statusCode, 200);
});

test("renovar falla con secreto equivocado, dispositivo inexistente o dispositivo revocado", async () => {
  const { app, store } = setup();
  const device = await registerDevice(app);
  const attempts = [
    { deviceId: device.deviceId, deviceSecret: newDeviceSecret() },
    { deviceId: "3f2b8f0e-6f58-4c4e-9a43-0d9c7a6d1b11", deviceSecret: device.deviceSecret },
  ];
  for (const payload of attempts) {
    const res = await app.inject({ method: "POST", url: "/v1/auth/token", payload });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, "unauthorized");
  }
  store.devices.get(device.deviceId)!.revokedAt = new Date();
  const revoked = await app.inject({ method: "POST", url: "/v1/auth/token", payload: { deviceId: device.deviceId, deviceSecret: device.deviceSecret } });
  assert.equal(revoked.statusCode, 401);
});

test("las rutas protegidas exigen un token válido", async () => {
  const { app, clock } = setup();
  const device = await registerDevice(app);
  const [header, payload, signature] = device.accessToken.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), sub: "3f2b8f0e-6f58-4c4e-9a43-0d9c7a6d1b11" })).toString("base64url");
  const otherSecretToken = (() => {
    const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const sig = createHmac("sha256", "otro-secreto-distinto-0123456789abcdef").update(`${h}.${payload}`).digest("base64url");
    return `${h}.${payload}.${sig}`;
  })();
  const algNone = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${payload}.`;

  const bad: Record<string, string | undefined> = {
    "sin cabecera": undefined,
    "esquema equivocado": `Basic ${device.accessToken}`,
    "token vacío": "Bearer ",
    "basura": "Bearer no.es.un-token",
    "payload alterado": `Bearer ${header}.${forgedPayload}.${signature}`,
    "firmado con otro secreto": `Bearer ${otherSecretToken}`,
    "alg none": `Bearer ${algNone}`,
  };
  for (const [name, authorization] of Object.entries(bad)) {
    const res = await app.inject({ method: "GET", url: "/v1/quota", headers: authorization ? { authorization } : {} });
    assert.equal(res.statusCode, 401, name);
    assert.equal(res.json().error.code, "unauthorized", name);
  }

  const ok = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(device.accessToken) });
  assert.equal(ok.statusCode, 200);
  clock.advanceSeconds(15 * 60 + 1);
  const expired = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(device.accessToken) });
  assert.equal(expired.statusCode, 401);
});

test("salud, versión y rutas desconocidas no piden token y usan el formato de error del contrato", async () => {
  const { app } = setup();
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/version" })).statusCode, 200);
  const missing = await app.inject({ method: "GET", url: "/v1/no-existe" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(Object.keys(missing.json()), ["error"]);
  assert.equal(missing.json().error.code, "not_found");
});

test("API general: 60 peticiones por minuto por usuario, y cada usuario tiene su cuenta", async () => {
  const { app, clock } = setup();
  const a = await registerDevice(app);
  const b = await registerDevice(app);
  for (let i = 0; i < 60; i++) {
    assert.equal((await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(a.accessToken) })).statusCode, 200);
  }
  const blocked = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(a.accessToken) });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error.code, "rate_limited");
  assert.equal((await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(b.accessToken) })).statusCode, 200);
  clock.advanceSeconds(61);
  assert.equal((await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(a.accessToken) })).statusCode, 200);
});

test("un error interno no filtra detalles al cliente", async () => {
  const { app, store } = setup();
  const device = await registerDevice(app);
  store.getOpenPeriod = async () => {
    throw new Error("clave-secreta-de-la-base");
  };
  const res = await app.inject({ method: "GET", url: "/v1/quota", headers: bearer(device.accessToken) });
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error.code, "internal");
  assert.equal(res.body.includes("clave-secreta"), false);
});
