import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { ApiProvider } from "../api";
import { PlansProvider, PlansStore, type PlansState } from "../data/plans";
import { seedState } from "../mocks/data";
import { bootstrapDevice } from "../api/bootstrap";
import type { ApiClient } from "../api/client";
import { CoachProvider, type Override } from "./coach";
import { createAppRouter } from "./router";

type Props = { initialEntries?: string[]; demo?: Override; api?: ApiClient | null; plans?: PlansState };

export function App({ initialEntries, demo, api = null, plans }: Props) {
  const [router] = useState(() => createAppRouter(initialEntries));
  // Datos simulados hasta que #7 traiga los planes reales.
  const [plansStore] = useState(() => new PlansStore(plans ?? seedState()));
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (!api) return;
    // Registra el teléfono si el enlace trae el código y refresca el bolsón.
    void bootstrapDevice(api).then((registered) => {
      if (registered) void queryClient.invalidateQueries();
    });
  }, [api, queryClient]);

  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <CoachProvider initial={demo}>
          <PlansProvider store={plansStore}>
            <RouterProvider router={router} />
          </PlansProvider>
        </CoachProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
