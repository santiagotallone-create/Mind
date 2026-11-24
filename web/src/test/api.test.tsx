import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { inviteCodeFromHash, newDeviceSecret } from "../api/auth";
import { bootstrapDevice } from "../api/bootstrap";
import { ApiError } from "../api/errors";
import { t } from "../i18n";
import { quotaExhausted } from "../mocks/data";
import { fakeApi } from "./fakeServer";
import { renderApp } from "./render";

describe("código de invitación y secreto del dispositivo", () => {
  it("lee #codigo= del fragmento", () => {
    expect(inviteCodeFromHash("#codigo=abc123")).toBe("abc123");
    expect(inviteCodeFromHash("#otro=1&codigo=xyz")).toBe("xyz");
    expect(inviteCodeFromHash("")).toBeNull();
    expect(inviteCodeFromHash("#codigo=")).toBeNull();
  });

  it("el secreto tiene 43 caracteres base64url (256 bits)", () => {
    const s = newDeviceSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newDeviceSecret()).not.toBe(s);
  });
});

describe("registro del dispositivo (arranque)", () => {
  const loc = (hash: string) => ({ hash, pathname: "/", search: "" });

  it("con código en el enlace: registra, guarda la credencial y borra el código de la dirección", async () => {
    const { api, auth, state } = fakeApi();
    const replaceState = vi.fn();
    expect(await bootstrapDevice(api, loc("#codigo=abc123"), { replaceState })).toBe(true);
    expect(await auth.isRegistered()).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(state.calls).toContain("POST /v1/auth/device");
  });

  it("calienta el servidor con /v1/version en cada arranque", async () => {
    const { api, state } = fakeApi();
    await bootstrapDevice(api, loc(""), { replaceState: vi.fn() });
    expect(state.calls).toContain("GET /v1/version");
  });

  it("un código inválido no rompe el arranque ni deja credencial, y igual se borra de la dirección", async () => {
    const { api, auth } = fakeApi();
    const replaceState = vi.fn();
    expect(await bootstrapDevice(api, loc("#codigo=mal"), { replaceState })).toBe(false);
    expect(await auth.isRegistered()).toBe(false);
    expect(replaceState).toHaveBeenCalled();
  });

  it("si el teléfono ya está registrado, no vuelve a registrarse", async () => {
    const { api, state } = fakeApi();
    await bootstrapDevice(api, loc("#codigo=abc123"), { replaceState: vi.fn() });
    state.calls.length = 0;
    expect(await bootstrapDevice(api, loc("#codigo=abc123"), { replaceState: vi.fn() })).toBe(false);
    expect(state.calls).not.toContain("POST /v1/auth/device");
  });
});

describe("tokens", () => {
  it("renueva el token una sola vez ante un 401 y reintenta la petición", async () => {
    const { api, state } = fakeApi();
    await api.auth.register("abc123");
    state.validToken = "otro"; // el servidor ya no reconoce el token en uso
    const quota = await api.getQuota();
    expect(quota.state).toBe("disponible");
    expect(state.calls.filter((c) => c === "POST /v1/auth/token")).toHaveLength(1);
  });

  it("si la renovación también da 401, olvida el dispositivo (revocado o borrado)", async () => {
    const { api, auth, state } = fakeApi();
    await auth.register("abc123");
    state.revoked = true;
    state.validToken = "otro";
    await expect(api.getQuota()).rejects.toMatchObject({ code: "unauthorized" });
    expect(await auth.isRegistered()).toBe(false);
  });

  it("varias peticiones a la vez comparten una sola renovación", async () => {
    let t = 0;
    const { api, auth, state } = fakeApi({ expiresInSeconds: 60, now: () => t });
    await auth.register("abc123");
    t = 120_000; // el token venció
    state.calls.length = 0;
    await Promise.all([api.getQuota(), api.getQuota(), api.getQuota()]);
    expect(state.calls.filter((c) => c === "POST /v1/auth/token")).toHaveLength(1);
  });

  it("sin dispositivo registrado, pedir datos da «unauthorized» sin llamar al servidor", async () => {
    const { api, state } = fakeApi();
    await expect(api.getQuota()).rejects.toBeInstanceOf(ApiError);
    expect(state.quotaGets).toBe(0);
  });

  it("un fallo de red se distingue de un error de la API", async () => {
    const { api, auth } = fakeApi();
    await auth.register("abc123");
    const offline = new (await import("../api/client")).ApiClient(auth, "", () => Promise.reject(new TypeError("fail")));
    await expect(offline.getQuota()).rejects.toMatchObject({ code: "network", isNetwork: true });
    void api;
  });
});

describe("Inicio con el bolsón y la conexión reales", () => {
  it("con bolsón disponible muestra el coach", async () => {
    const { api, auth } = fakeApi();
    await auth.register("abc123");
    renderApp("/", undefined, api);
    expect(await screen.findByRole("heading", { name: t("home.title") })).toBeInTheDocument();
  });

  it("con el bolsón agotado según el servidor, el Inicio cambia a «sin coach» con la fecha de renovación", async () => {
    const { api, auth } = fakeApi({ quota: quotaExhausted });
    await auth.register("abc123");
    renderApp("/", undefined, api);
    expect(await screen.findByRole("heading", { name: t("home.titleNoCoach") })).toBeInTheDocument();
    expect(screen.getByText(t("home.coachReturns", { date: "1 de diciembre" }))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("home.startMeditation") })).toHaveClass("primary");
  });

  it("cambia en vivo cuando se pierde y vuelve la conexión", async () => {
    const { api, auth } = fakeApi();
    await auth.register("abc123");
    renderApp("/", undefined, api);
    expect(await screen.findByRole("heading", { name: t("home.title") })).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("offline")));
    await waitFor(() => expect(screen.getByRole("heading", { name: t("home.titleNoCoach") })).toBeInTheDocument());
    expect(screen.getByText(t("home.needsInternet"))).toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.getByRole("heading", { name: t("home.title") })).toBeInTheDocument());
  });

  it("si el teléfono aún no está registrado, el Inicio no bloquea el coach (decide el servidor al abrir la charla)", async () => {
    const { api } = fakeApi();
    renderApp("/", undefined, api);
    expect(await screen.findByRole("heading", { name: t("home.title") })).toBeInTheDocument();
  });

  it("Ajustes muestra el consumo real y, sin datos, un aviso", async () => {
    const { api, auth } = fakeApi();
    await auth.register("abc123");
    renderApp("/yo/ajustes", undefined, api);
    expect(await screen.findByText(t("settings.remaining", { remaining: "50 min", total: "2 h" }))).toBeInTheDocument();
  });
});
