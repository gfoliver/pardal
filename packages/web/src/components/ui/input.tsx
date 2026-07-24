import * as React from "react";
import { cn } from "../../lib/utils";

const base =
  "h-9 w-full rounded-md border border-border-strong bg-transparent px-3 text-sm text-fg placeholder:text-fg-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:opacity-40";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = "Input";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-xs font-medium uppercase tracking-wide text-fg-muted", className)} {...props} />
  ),
);
Label.displayName = "Label";
