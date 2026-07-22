import { Toaster as Sonner } from "sonner";
import { useApp } from "../../app/AppProviders";

export function Toaster() {
  const { theme } = useApp();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-elevated !border !border-border-strong !text-fg !rounded-md !shadow-xl !text-sm !font-sans",
          title: "!font-semibold",
          description: "!text-fg-muted",
          actionButton: "!bg-primary !text-primary-foreground !rounded-sm",
          icon: "!text-primary",
        },
      }}
    />
  );
}
