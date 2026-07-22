import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 h-[18px] text-2xs font-bold uppercase tracking-caps leading-none",
  {
    variants: {
      variant: {
        muted: "bg-surface-2 text-fg-muted border border-border",
        primary: "bg-primary-soft text-primary",
        gold: "text-gold bg-[color-mix(in_srgb,var(--gold)_16%,transparent)]",
        gk: "bg-pos-gk text-[#04140e]",
        def: "bg-pos-def text-[#04140e]",
        mid: "bg-pos-mid text-[#04140e]",
        att: "bg-pos-att text-[#04140e]",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
