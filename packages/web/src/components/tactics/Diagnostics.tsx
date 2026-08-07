import { ChevronRight, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { TacticsDiagnostic, TacticsDiagnosticSeverity } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";

/**
 * What is wrong with this side, said out loud.
 *
 * The career has computed this since the day tactics were saveable and NOTHING has ever shown it: an
 * injured starter that the team builder will quietly replace at kick-off, a bench with no goalkeeper,
 * two slots dragged onto the same blade of grass. All of it was discoverable only by noticing, and the
 * board is exactly the screen where you would not.
 *
 * Every item that knows which slot it is about is a button that opens that slot, because a problem you
 * cannot act on from where you are told about it is a problem you will not fix.
 */

/**
 * Severity → the token pair it is drawn in.
 *
 * Read from the baked `-soft` tokens rather than an opacity modifier. These colours are `var()`
 * references, so `bg-danger/10` has no channels to compute an alpha from and Tailwind emits NO CSS
 * AT ALL — the row would render unstyled with nothing in the build to complain about.
 */
const TONE: Record<TacticsDiagnosticSeverity, { box: string; ink: string }> = {
  error: { box: "bg-[var(--danger-soft)]", ink: "text-danger" },
  warn: { box: "bg-[var(--gold-soft)]", ink: "text-gold" },
  info: { box: "bg-surface-2", ink: "text-fg-muted" },
};

/** Worst first, which is the order a manager triages in. */
const RANK: Record<TacticsDiagnosticSeverity, number> = { error: 0, warn: 1, info: 2 };

export function TacticsDiagnostics({
  diagnostics,
  nameOf,
  onSelectSlot,
}: {
  diagnostics: readonly TacticsDiagnostic[];
  nameOf: (playerId: string, fallback: string) => string;
  /** Opens the slot an item is about. Items with no slot are plain rows. */
  onSelectSlot: (slot: number) => void;
}) {
  const { t } = useApp();
  const fmt = useFormat();

  const text = (d: TacticsDiagnostic): string => {
    const name = d.playerId ? nameOf(d.playerId, d.playerName ?? d.playerId) : "";
    switch (d.kind) {
      // The `diag*` catalogue, which has been sitting in the strings file translated into both
      // locales and referenced by nothing at all — written for this panel before there was one.
      case "starterUnavailable":
        return fmt.t(t.diagStarterUnavailable, { name });
      case "outOfPosition":
        return fmt.t(t.diagOutOfPosition, { name });
      case "noBenchGk":
        return t.diagNoBenchGk;
      case "overlappingSlots":
        return t.diagOverlappingSlots;
      case "benchShort":
        return t.diagBenchShort;
    }
  };

  /*
   * One row per problem, not per pair. `overlappingSlots` is emitted for every colliding PAIR, so
   * three shirts stacked in one corner produce three identical-looking lines about the same mess.
   * Keyed on what the row actually says.
   */
  const seen = new Set<string>();
  const items = [...diagnostics]
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .filter((d) => {
      const key = `${d.kind}:${d.slot ?? ""}:${d.playerId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
        <CircleCheck className="size-5 text-fg-faint" />
        <p className="text-sm font-medium text-fg-muted">{t.tacNoIssues}</p>
      </div>
    );
  }

  return (
    // Columns rather than one tall stack: the panel spans the whole board, and a full-width row per
    // problem would be a screenful of mostly-empty boxes on the day three things are wrong.
    <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((d) => {
        const tone = TONE[d.severity];
        const body = (
          <>
            <span className={cn("mt-px shrink-0", tone.ink)}>
              {d.severity === "info" ? <Info className="size-4" /> : <TriangleAlert className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 text-xs text-fg">{text(d)}</span>
          </>
        );
        return (
          <li key={`${d.kind}:${d.slot ?? ""}:${d.playerId ?? ""}`}>
            {d.slot !== undefined ? (
              <button
                type="button"
                onClick={() => onSelectSlot(d.slot!)}
                aria-label={`${text(d)} — ${t.tacShowSlot}`}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:brightness-110 focus-visible:brightness-110",
                  tone.box,
                )}
              >
                {body}
                <ChevronRight className="mt-px size-4 shrink-0 text-fg-faint" />
              </button>
            ) : (
              <div className={cn("flex items-start gap-2 rounded-md px-2 py-1.5", tone.box)}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
