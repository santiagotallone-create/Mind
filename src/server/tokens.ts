import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ApiError } from "./errors.js";

const ISSUER = "mind";
const AUDIENCE = "mind-api";

/** Hash del secreto del dispositivo. El secreto tiene 256 bits aleatorios, así que SHA-256 alcanza (no es una contraseña elegida por una persona). */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Comparación en tiempo constante: se comparan los hashes, que siempre miden lo mismo. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export interface Identity {
  userId: string;
  deviceId: string;
}

/** Tokens de acceso (JWT HS256) de corta vida. */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }

  async issue(identity: Identity): Promise<string> {
    const issuedAt = Math.floor(this.clock().getTime() / 1000);
    return new SignJWT({ did: identity.deviceId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(identity.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: this.clock(),
      });
      if (typeof payload.sub !== "string" || typeof payload.did !== "string") throw new Error("Token incompleto");
      return { userId: payload.sub, deviceId: payload.did };
    } catch {
      throw new ApiError("unauthorized", "Token inválido o vencido");
    }
  }
}
