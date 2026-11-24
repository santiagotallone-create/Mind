import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

/** Estado que viaja con la navegación para saber a qué pantalla volver. */
export type FromState = { from?: string };

/** Abre una pantalla recordando de dónde viene (charlas y «Coach no disponible» vuelven a su origen). */
export function useGoWithOrigin() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return useCallback((to: string) => navigate(to, { state: { from: pathname } satisfies FromState }), [navigate, pathname]);
}

/** Vuelve a la pantalla de origen; si no hay (entrada directa), a `fallback`. */
export function useReturnToOrigin(fallback = "/") {
  const navigate = useNavigate();
  const { state } = useLocation();
  const from = (state as FromState | null)?.from;
  return useCallback(() => navigate(from ?? fallback, { replace: true }), [navigate, from, fallback]);
}
