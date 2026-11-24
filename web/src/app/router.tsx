import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { ClosingTalk, Interview, Talk } from "../screens/Talk";
import { CoachUnavailable } from "../screens/CoachUnavailable";
import { DevMap } from "../screens/Dev";
import { FirstUse, ProposedPlans } from "../screens/Activation";
import { Home } from "../screens/Home";
import { DataDeleted, EditProfile, Me, Privacy, Profile, Settings } from "../screens/Me";
import { NotFound } from "../screens/NotFound";
import { PlanDetail } from "../screens/PlanDetail";
import { Plans } from "../screens/Plans";
import { Player } from "../screens/Player";
import { SessionBefore } from "../screens/SessionBefore";
import { FullLayout, TabLayout } from "./layouts";

/**
 * Mapa de rutas. Con menú inferior (TabLayout): Inicio, Planes, Yo y sus pantallas hijas.
 * Sin menú (FullLayout): meditación activa, cualquier charla y la activación (primer uso, entrevista, planes propuestos).
 */
export const routes: RouteObject[] = [
  {
    element: <TabLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/planes", element: <Plans /> },
      { path: "/planes/:planId", element: <PlanDetail /> },
      { path: "/sesion/:sessionId/antes", element: <SessionBefore /> },
      { path: "/yo", element: <Me /> },
      { path: "/yo/perfil", element: <Profile /> },
      { path: "/yo/perfil/editar/:campo", element: <EditProfile /> },
      { path: "/yo/ajustes", element: <Settings /> },
      { path: "/yo/ajustes/privacidad", element: <Privacy /> },
    ],
  },
  {
    element: <FullLayout />,
    children: [
      { path: "/sesion/:sessionId/reproductor", element: <Player /> },
      { path: "/charla", element: <Talk /> },
      { path: "/charla/cierre", element: <ClosingTalk /> },
      { path: "/entrevista", element: <Interview /> },
      { path: "/primer-uso", element: <FirstUse /> },
      { path: "/planes-propuestos", element: <ProposedPlans /> },
      { path: "/sin-coach", element: <CoachUnavailable /> },
      { path: "/datos-borrados", element: <DataDeleted /> },
      ...(import.meta.env.DEV ? [{ path: "/mapa", element: <DevMap /> }] : []),
      { path: "*", element: <NotFound /> },
    ],
  },
];

/** Con `initialEntries` crea un router en memoria (pruebas); sin él, el del navegador. */
export function createAppRouter(initialEntries?: string[]) {
  return initialEntries ? createMemoryRouter(routes, { initialEntries }) : createBrowserRouter(routes);
}
