import { RefreshRequestSchema, RegisterDeviceRequestSchema, TokenResponseSchema, type TokenResponse } from "@contract";
import { ApiError } from "./errors";
import type { KeyValueStore } from "./storage";

const KEY = "device";
type Device = { deviceId: string; deviceSecret: string };
type FetchFn = typeof fetch;

/** 32 bytes aleatorios en base64url (43 caracteres): el secreto del dispositivo (docs/api.md). */
export function newDeviceSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lee `#codigo=…` del fragmento de la dirección. */
export function inviteCodeFromHash(hash: string): string | null {
  const code = new URLSearchParams(hash.replace(/^#/, "")).get("codigo");
  return code && code.trim() ? code.trim() : null;
}

/**
 * Identidad del dispositivo sin cuentas: el secreto vive en el teléfono y sirve para obtener tokens de 15 minutos
 * (duda 20, decidida por Santi: el secreto del dispositivo es la credencial de renovación).
 */
export class DeviceAuth {
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    private readonly storage: KeyValueStore,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn,
    private readonly now: () => number = Date.now,
  ) {}

  async isRegistered(): Promise<boolean> {
    return (await this.storage.get<Device>(KEY)) !== undefined;
  }

  /** Registra la instalación con el código del enlace. Si ya está registrada, no hace nada. */
  async register(inviteCode: string, deviceName?: string): Promise<void> {
    if (await this.isRegistered()) return;
    const deviceSecret = newDeviceSecret();
    const body = RegisterDeviceRequestSchema.parse({ inviteCode, deviceSecret, deviceName });
    const res = await this.post("/v1/auth/device", body);
    await this.storage.set<Device>(KEY, { deviceId: res.deviceId, deviceSecret });
    this.remember(res);
  }

  /** Token vigente; renueva si venció. Varias llamadas simultáneas comparten una sola renovación. */
  async accessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt - 30_000 > this.now()) return this.token.value;
    return this.refresh();
  }

  /** Fuerza una renovación (tras un 401). Devuelve null si no hay dispositivo registrado. */
  async refresh(): Promise<string | null> {
    const device = await this.storage.get<Device>(KEY);
    if (!device) return null;
    this.pending ??= this.requestToken(device).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Olvida el dispositivo (la credencial ya no vale: revocado o borrado en el servidor). */
  async forget(): Promise<void> {
    this.token = null;
    await this.storage.delete(KEY);
  }

  private async requestToken(device: Device): Promise<string> {
    const body = RefreshRequestSchema.parse(device);
    try {
      const res = await this.post("/v1/auth/token", body);
      return this.remember(res);
    } catch (e) {
      // Si la renovación también da 401, el dispositivo fue revocado o borrado.
      if (e instanceof ApiError && e.code === "unauthorized") await this.forget();
      throw e;
    }
  }

  private remember(res: TokenResponse): string {
    this.token = { value: res.accessToken, expiresAt: this.now() + res.expiresInSeconds * 1000 };
    return res.accessToken;
  }

  private async post(path: string, body: unknown): Promise<TokenResponse> {
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError("network", 0, "Sin conexión");
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw errorFrom(res.status, json);
    return TokenResponseSchema.parse(json);
  }
}

/** Convierte la respuesta de error de la API en ApiError. */
export function errorFrom(status: number, json: unknown): ApiError {
  const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
  const code = (err?.code ?? (status === 401 ? "unauthorized" : "internal")) as ConstructorParameters<typeof ApiError>[0];
  return new ApiError(code, status, err?.message ?? `Error ${status}`);
}
