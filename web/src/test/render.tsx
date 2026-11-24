import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiClient } from "../api/client";
import { App } from "../app/App";
import type { PlansState } from "../data/plans";

export function renderApp(entry = "/", demo?: { quotaOk?: boolean; online?: boolean }, api: ApiClient | null = null, plans?: PlansState) {
  const user = userEvent.setup();
  render(<App initialEntries={[entry]} demo={demo} api={api} plans={plans} />);
  return { user };
}
