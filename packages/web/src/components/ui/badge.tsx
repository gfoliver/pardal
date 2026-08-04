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
        danger: "text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)]",
        gk: "bg-pos-gk text-ink",
        def: "bg-pos-def text-ink",
        mid: "bg-pos-mid text-ink",
        att: "bg-pos-att text-ink",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * `forwardRef` is not decoration here: badges are the usual `TooltipTrigger
 * asChild` / `Abbrev asChild` target, and Radix attaches its positioning ref to
 * whatever the trigger wraps. Without it React warned on every tooltipped badge
 * and the popper had nothing to anchor to.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { badgeVariants };
