import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError, type ZodType } from "zod";
import type { ApiError as ApiErrorBody } from "../contract/index.js";

export type ErrorCode = ApiErrorBody["error"]["code"];

const statusByCode: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  invalid_invite: 403,
  quota_exhausted: 403,
  not_found: 404,
  rate_limited: 429,
  offline_generation_unavailable: 503,
  internal: 500,
};

/** Error con el formato del contrato: { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
  }

  get statusCode(): number {
    return statusByCode[this.code];
  }
}

/** Valida con un esquema del contrato; si falla responde 400 invalid_request. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ApiError("invalid_request", describeZodError(result.error));
}

function describeZodError(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: "Ruta no encontrada" } });
  });

  app.setErrorHandler((error: FastifyError | ApiError | ZodError, request, reply) => {
    if (error instanceof ApiError) {
      if (error.options.retryAfterSeconds !== undefined) reply.header("Retry-After", String(error.options.retryAfterSeconds));
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "invalid_request", message: describeZodError(error) } });
    }
    const status = (error as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      // Errores de Fastify por la petición (JSON mal formado, cuerpo demasiado grande, etc.).
      return reply.code(status).send({ error: { code: status === 404 ? "not_found" : "invalid_request", message: "Petición inválida" } });
    }
    // Nunca se devuelve el detalle de un error interno.
    request.log.error(error);
    return reply.code(500).send({ error: { code: "internal", message: "Error interno" } });
  });
}
