import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/AppProviders";
import { CareerProvider } from "./app/CareerProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import App from "./App";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "flag-icons/css/flag-icons.min.css";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <CareerProvider>
        <TooltipProvider delayDuration={200}>
          <App />
          <Toaster />
        </TooltipProvider>
      </CareerProvider>
    </AppProviders>
  </StrictMode>,
);
