import { Navigate } from "react-router";

/** Cualquier ruta desconocida vuelve a Inicio. */
export function NotFound() {
  return <Navigate to="/" replace />;
}
