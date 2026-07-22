import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/AppProviders";
import App from "./App";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
