import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";

test("healthz responde ok", async () => {
  const app = buildApp();
  const res = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });
  await app.close();
});

test("una ruta desconocida responde 404", async () => {
  const app = buildApp();
  const res = await app.inject({ method: "GET", url: "/no-existe" });
  assert.equal(res.statusCode, 404);
  await app.close();
});
