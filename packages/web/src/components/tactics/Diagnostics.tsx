import { useState } from "react";
import { ChevronRight, CircleCheck, Info, TriangleAlert } from "lucide-react";
import {
  SEVERITY_RANK,
  worstSeverity,
  type TacticsDiagnostic,
  type TacticsDiagnosticSeverity,
} from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useFormat } from "../../lib/format";
import { Abbrev } from "../ui/abbrev";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
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
 *
 * THE ONE severity→colour table. The icon that opens this list reads its ink from here too, which is
 * what stops the icon going yellow over a red row — a second table on the screen is exactly how those
 * two drift apart.
 */
const SEVERITY_TONE: Record<TacticsDiagnosticSeverity, { box: string; ink: string }> = {
  error: { box: "bg-[var(--danger-soft)]", ink: "text-danger" },
  warn: { box: "bg-[var(--gold-soft)]", ink: "text-gold" },
  info: { box: "bg-surface-2", ink: "text-fg-muted" },
};

/**
 * The fourth state, which is not a severity: nothing to report.
 *
 * `--primary` IS this theme's green (`#16d497`, the same hue as `--brand-emerald`), so a clean side is
 * drawn in the accent the rest of the app already means "good" with — not an invented green.
 */
const CLEAN_INK = "text-primary";

/** The list itself. Not exported: the icon below is the only way in, and it owns the dialog. */
function TacticsDiagnostics({
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
      case "starterSuspended":
        return fmt.t(t.diagStarterSuspended, { name });
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
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
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
    // One tall stack, not columns: this list is read inside a dialog now, and three 200px columns of
    // wrapped sentences is harder to triage than five full-width rows in severity order.
    <ul className="grid gap-1.5">
      {items.map((d) => {
        const tone = SEVERITY_TONE[d.severity];
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

/**
 * The whole report as ONE icon in the board's toolbar, opening the list in a dialog.
 *
 * It replaces a full-width card that sat above the board saying "Nothing to flag in this side" on almost
 * every visit — a permanent panel for an occasional problem. THE COLOUR IS THE SUMMARY: a green check
 * when there is nothing to report, and otherwise the worst severity's own ink, read from the same
 * `SEVERITY_TONE` the rows use — so an unavailable starter turns the icon red, not amber, and the icon
 * and the row it opens onto never disagree.
 *
 * The empty state stays reachable on purpose. Green already says "fine", but the icon is now the only way
 * in, and a control that does nothing when pressed reads as broken — so a curious tap gets the dashed box
 * confirming it in words.
 */
export function TacticsDiagnosticsButton({
  diagnostics,
  nameOf,
  onSelectSlot,
}: {
  diagnostics: readonly TacticsDiagnostic[];
  nameOf: (playerId: string, fallback: string) => string;
  /** Opens the slot a row is about — from inside the dialog, so it closes on the way. */
  onSelectSlot: (slot: number) => void;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const worst = worstSeverity(diagnostics);
  /*
   * `info` is drawn neutral grey in the LIST, where the coloured rows around it carry the severity. It
   * cannot be grey HERE: the icon is the only thing on the board saying anything is wrong at all, and a
   * grey mark says nothing — so an info-only side folds into the warning colour. The one `info` kind
   * there is (a bench too thin to cover an injury) is something to fix, not a note.
   */
  const ink = worst ? SEVERITY_TONE[worst === "info" ? "warn" : worst].ink : CLEAN_INK;

  return (
    <>
      {/* Icon-only at every width, unlike its neighbours in this group: the state IS the icon, so a
          label beside it would only repeat what the colour already said. */}
      <Abbrev full={t.diagnostics} asChild>
        <Button variant="ghost" size="icon" aria-label={t.diagnostics} onClick={() => setOpen(true)}>
          {worst ? <TriangleAlert className={ink} /> : <CircleCheck className={ink} />}
        </Button>
      </Abbrev>

      {/*
        `modal={false}` is load-bearing, not a preference — the same trap `PlayerMenu` and this board's
        tactic-tabs menu both document. Every actionable row hands the manager to the slot drawer, which
        is itself a modal Radix dialog: one layer releasing `body { pointer-events }` while another takes
        it inside the same tick is exactly how that lock is left stuck, and then the whole app is dead to
        the mouse until a reload. A non-modal layer never takes the lock at all, so the drawer is the only
        thing that ever holds it. The cost is the dim backdrop (Radix drops the overlay entirely when a
        dialog is not modal); Escape and click-outside still dismiss, and this is a report to read rather
        than a form to fill.
      */}
      <Dialog modal={false} open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.diagnostics}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TacticsDiagnostics
              diagnostics={diagnostics}
              nameOf={nameOf}
              // Closed HERE, in the same handler that opens the slot: a drawer stacked on top of the
              // dialog it came from would bury the very slot it is about.
              onSelectSlot={(slot) => {
                setOpen(false);
                onSelectSlot(slot);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
