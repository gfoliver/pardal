import type { ReactNode } from "react";
import { Separator } from "./separator";

export function PageHeader({
  kicker,
  title,
  meta,
  action,
}: {
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="caps inline-flex items-center gap-2 text-primary">
            <span className="h-0.5 w-4 rounded-full bg-primary" />
            {kicker}
          </span>
          <h1 className="serif mt-2 text-[2.5rem] leading-none">{title}</h1>
          {meta && <p className="mt-2 text-sm text-fg-muted">{meta}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <Separator className="mt-4" />
    </header>
  );
}
