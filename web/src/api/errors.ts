import type { ApiError as ApiErrorBody } from "@contract";

type ErrorCode = ApiErrorBody["error"]["code"];

/** Error de la API (códigos de `docs/api.md`) o de red (`status` 0, sin respuesta). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork() {
    return this.code === "network";
  }
}
