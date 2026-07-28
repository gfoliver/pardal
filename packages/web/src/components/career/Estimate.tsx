import { Star } from "lucide-react";
import type { Estimate } from "@fut/career";
import { cn } from "../../lib/utils";

/**
 * Rendering an uncertain number honestly.
 *
 * The rule these components exist to enforce: if the career gave us a band, the
 * screen shows a band. Quietly printing the midpoint would look tidier and would
 * be a lie — the whole scouting model is built on the manager knowing how much
 * he doesn't know.
 */

/** A band as "62–78", or the plain number once it is certain. */
export function EstimateText({ e, format, className }: { e?: Estimate; format?: (n: number) => string; className?: string }) {
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  if (!e) return <span className={cn("text-fg-faint", className)}>?</span>;
  if (e.exact) return <span className={cn("tabular-nums", className)}>{fmt(e.mid)}</span>;
  return (
    <span className={cn("tabular-nums text-fg-muted", className)}>
      {fmt(e.low)}<span className="mx-0.5 text-fg-faint">–</span>{fmt(e.high)}
    </span>
  );
}

/**
 * A 0-99 attribute as a bar with the uncertainty drawn on it: a solid block for
 * the scout's best guess, a lighter span for how wrong he might be.
 *
 * `relevance` (0-1) dims attributes the player's position doesn't use, so all
 * twenty can be on screen without all twenty shouting. It comes from the
 * engine's own weights — see `relevanceAt`.
 */
export function EstimateBar({ e, relevance = 1, color }: { e: Estimate; relevance?: number; color: string }) {
  const width = Math.max(1.5, e.high - e.low);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2" style={{ opacity: 0.35 + relevance * 0.65 }}>
      {!e.exact && (
        <div className="absolute inset-y-0 rounded-full opacity-25" style={{ left: `${e.low}%`, width: `${width}%`, background: color }} />
      )}
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${e.mid}%`, background: color }} />
    </div>
  );
}

/** Potential as a star band: solid stars are certain, hollow ones are the spread. */
export function StarBand({ e }: { e?: Estimate }) {
  if (!e) return <span className="text-fg-faint">?</span>;
  return (
    <span className="inline-flex" title={e.exact ? undefined : `${e.low}–${e.high}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const certain = n <= e.low;
        const possible = n <= e.high;
        return (
          <Star
            key={i}
            className={cn(
              "size-3.5",
              certain ? "fill-gold text-gold" : possible ? "text-gold opacity-50" : "text-fg-faint",
            )}
          />
        );
      })}
    </span>
  );
}
