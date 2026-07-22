import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "../../lib/utils";

export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn("inline-flex gap-0.5 rounded-md border border-border bg-surface-2 p-0.5", className)}
    {...props}
  />
));
ToggleGroup.displayName = "ToggleGroup";

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & { accent?: boolean }
>(({ className, accent, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-semibold text-fg-muted outline-none transition-colors",
      "hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
      accent
        ? "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        : "data-[state=on]:bg-surface-3 data-[state=on]:text-fg",
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";
