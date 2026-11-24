import type { QuotaStatus } from "@contract";
import { DeviceAuth } from "../api/auth";
import { ApiClient } from "../api/client";
import { memoryStore, type KeyValueStore } from "../api/storage";
import { quotaAvailable } from "../mocks/data";

type Opts = { inviteCode?: string; quota?: QuotaStatus; expiresInSeconds?: number };

/** Servidor simulado con las rutas de auth y bolsón del contrato. Registra las llamadas para comprobarlas. */
export function fakeServer(opts: Opts = {}) {
  const state = {
    inviteCode: opts.inviteCode ?? "abc123",
    quota: opts.quota ?? quotaAvailable,
    expiresInSeconds: opts.expiresInSeconds ?? 900,
    secret: null as string | null,
    tokenSeq: 0,
    validToken: "",
    calls: [] as string[],
    quotaGets: 0,
    revoked: false,
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const issue = () => {
    state.validToken = `token-${++state.tokenSeq}`;
    return { deviceId: "11111111-2222-4333-8444-555555555555", accessToken: state.validToken, expiresInSeconds: state.expiresInSeconds };
  };

  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = new URL(url, "http://x").pathname;
    state.calls.push(`${init?.method ?? "GET"} ${path}`);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
    if (path === "/v1/version") return json(200, { name: "mind", apiVersion: 1 });
    if (path === "/v1/auth/device") {
      if (body.inviteCode !== state.inviteCode) return json(403, { error: { code: "invalid_invite", message: "Código de invitación inválido" } });
      state.secret = body.deviceSecret ?? null;
      return json(200, issue());
    }
    if (path === "/v1/auth/token") {
      if (state.revoked || body.deviceSecret !== state.secret) return json(401, { error: { code: "unauthorized", message: "Credenciales inválidas" } });
      return json(200, issue());
    }
    if (path === "/v1/quota") {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth !== `Bearer ${state.validToken}`) return json(401, { error: { code: "unauthorized", message: "Token inválido" } });
      state.quotaGets++;
      return json(200, state.quota);
    }
    return json(404, { error: { code: "not_found", message: "No existe" } });
  };

  return { state, fetchFn };
}

export function fakeApi(opts: Opts & { storage?: KeyValueStore; now?: () => number } = {}) {
  const server = fakeServer(opts);
  const storage = opts.storage ?? memoryStore();
  const auth = new DeviceAuth(storage, "", server.fetchFn, opts.now);
  const api = new ApiClient(auth, "", server.fetchFn);
  return { ...server, api, auth, storage };
}
