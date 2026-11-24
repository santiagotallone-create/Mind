import { inviteCodeFromHash } from "./auth";
import type { ApiClient } from "./client";

/**
 * Arranque de la app: calienta el servidor y, si la dirección trae `#codigo=…`, registra el teléfono y borra
 * el código de la dirección (duda 4, decidida por Santi: enlace con el código, sin pantalla nueva).
 * Devuelve true si registró un dispositivo nuevo. Los errores de registro no rompen el arranque:
 * su aviso en pantalla (copy pendiente del UI) llega con la historia de activación (#12).
 */
export async function bootstrapDevice(
  api: ApiClient,
  loc: Pick<Location, "hash" | "pathname" | "search"> = window.location,
  hist: Pick<History, "replaceState"> = window.history,
): Promise<boolean> {
  api.warmUp();
  const code = inviteCodeFromHash(loc.hash);
  if (!code) return false;
  // El código sale de la dirección cuanto antes, haya o no registro.
  hist.replaceState(null, "", loc.pathname + loc.search);
  if (await api.auth.isRegistered()) return false;
  try {
    await api.auth.register(code);
    return true;
  } catch {
    return false;
  }
}
