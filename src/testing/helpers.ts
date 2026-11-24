import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { loadEnv, type ServerEnv } from "../server/env.js";

/** Reloj controlable para las pruebas. */
export class FakeClock {
  constructor(private current: Date) {}
  now = (): Date => new Date(this.current);
  set(iso: string): void {
    this.current = new Date(iso);
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

/** Reloj monótono en ms para el medidor. */
export class FakeMonotonic {
  ms = 0;
  now = (): number => this.ms;
  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
}

export function testEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return { ...loadEnv({ NODE_ENV: "test" }), ...overrides };
}

/** Secreto de dispositivo como lo genera la app: 256 bits en base64url (43 caracteres). */
export function newDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export interface RegisteredDevice {
  deviceId: string;
  deviceSecret: string;
  accessToken: string;
  userId: string;
}

export async function registerDevice(app: FastifyInstance, inviteCode = "codigo-de-prueba"): Promise<RegisteredDevice> {
  const deviceSecret = newDeviceSecret();
  const res = await app.inject({ method: "POST", url: "/v1/auth/device", payload: { inviteCode, deviceSecret } });
  if (res.statusCode !== 200) throw new Error(`Registro falló: ${res.statusCode} ${res.body}`);
  const body = res.json();
  const payload = JSON.parse(Buffer.from(body.accessToken.split(".")[1], "base64url").toString());
  return { deviceId: body.deviceId, deviceSecret, accessToken: body.accessToken, userId: payload.sub };
}

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
