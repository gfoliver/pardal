import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Where you are, and the way back up.
 *
 * A trail entry with an `onSelect` is a link; the last one never is, because it is
 * the page you are already looking at. Kept deliberately quiet — this is
 * orientation, not a headline, so it sits above the screen title rather than
 * competing with it.
 */
export interface Crumb {
  readonly label: string;
  readonly onSelect?: () => void;
}

export function Breadcrumb({ trail, className }: { trail: readonly Crumb[]; className?: string }) {
  const items = trail.filter((c) => c.label);
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-fg-faint" aria-hidden />}
              {last || !c.onSelect ? (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "font-medium text-fg")}>
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={c.onSelect}
                  className="truncate rounded-sm outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {c.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
