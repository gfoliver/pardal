import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-tight transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40 active:translate-y-px [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-border-strong bg-transparent text-fg hover:bg-surface-2 hover:border-fg-faint",
        ghost: "bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg",
        danger: "border border-danger bg-transparent text-danger hover:bg-[var(--danger-soft)]",
      },
      size: {
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        default: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-10 px-5 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-7 w-7 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
