import { QuotaStatusSchema, type QuotaStatus } from "@contract";
import type { z } from "zod";
import { DeviceAuth, errorFrom } from "./auth";
import { ApiError } from "./errors";

type FetchFn = typeof fetch;

/** Cliente de la API. Añade el token, renueva una sola vez ante un 401 y valida las respuestas con el contrato. */
export class ApiClient {
  constructor(
    readonly auth: DeviceAuth,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn,
  ) {}

  /** Calienta el servidor (Cloud Run arranca en frío). No espera, no cachea y ignora los errores. */
  warmUp(): void {
    this.fetchFn(`${this.baseUrl}/v1/version`, { cache: "no-store" }).catch(() => undefined);
  }

  getQuota(): Promise<QuotaStatus> {
    return this.get("/v1/quota", QuotaStatusSchema);
  }

  async get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    const token = await this.auth.accessToken();
    if (!token) throw new ApiError("unauthorized", 401, "Este teléfono aún no está registrado");
    let res = await this.send(path, token);
    if (res.status === 401) {
      const fresh = await this.auth.refresh();
      if (fresh) res = await this.send(path, fresh);
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw errorFrom(res.status, json);
    return schema.parse(json);
  }

  private async send(path: string, token: string): Promise<Response> {
    try {
      return await this.fetchFn(this.baseUrl + path, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new ApiError("network", 0, "Sin conexión");
    }
  }
}
