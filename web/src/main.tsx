import "@fontsource-variable/manrope/wght.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { createApi } from "./api";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/global.css";

// La versión nueva se activa en el siguiente arranque, nunca en medio de una meditación.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={createApi()} />
  </StrictMode>,
);
