import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";

export function renderApp(entry = "/", demo?: { quotaOk?: boolean; online?: boolean }) {
  const user = userEvent.setup();
  render(<App initialEntries={[entry]} demo={demo} />);
  return { user };
}
