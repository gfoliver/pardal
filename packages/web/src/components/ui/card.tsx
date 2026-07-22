import * as React from "react";
import { cn } from "../../lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border border-border bg-surface", className)} {...props} />
  ),
);
Card.displayName = "Card";

export function CardHeader({ className, children, action }: React.HTMLAttributes<HTMLDivElement> & { action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-hairline px-4 py-3", className)}>
      <div className="min-w-0">{children}</div>
      {action}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("caps text-fg-muted !font-sans", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
