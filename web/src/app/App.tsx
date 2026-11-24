import { useState } from "react";
import { RouterProvider } from "react-router";
import { DemoProvider } from "./demo";
import { createAppRouter } from "./router";

type Props = { initialEntries?: string[]; demo?: { quotaOk?: boolean; online?: boolean } };

export function App({ initialEntries, demo }: Props) {
  const [router] = useState(() => createAppRouter(initialEntries));
  return (
    <DemoProvider initial={demo}>
      <RouterProvider router={router} />
    </DemoProvider>
  );
}
