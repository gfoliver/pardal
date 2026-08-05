import { useState } from "react";
import { Columns3, X } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Button } from "../ui/button";
import { useFormat } from "../../lib/format";
import { CompareSheet } from "./CompareSheet";
import type { FieldSpec } from "./types";
import type { Selection } from "./useSelection";
import type { ReactNode } from "react";

/**
 * What to do with the rows he has ticked. Renders nothing until he has ticked one.
 *
 * Appearing only when there is a selection is the point: an empty bar sitting above every list would
 * be a permanent row of disabled buttons explaining a feature nobody asked for yet, and the space it
 * costs is space the list wanted.
 */
export function SelectionBar<T>({ rows, rowKey, specs, selection, heading }: {
  /**
   * ALL the rows, not the filtered ones. Ticking two players and then narrowing the list to check
   * something must not lose the comparison he was in the middle of building.
   */
  rows: readonly T[];
  rowKey: (row: T) => string;
  specs: readonly FieldSpec<T>[];
  selection: Selection;
  /** The column head for one row in the comparison — who is being compared. */
  heading: (row: T) => ReactNode;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);

  if (selection.ids.length === 0) return null;

  // Resolved in PICK order, not row order, so the columns stay where he put them while he sorts the
  // table underneath.
  const byKey = new Map(rows.map((r) => [rowKey(r), r]));
  const picked = selection.ids.map((id) => byKey.get(id)).filter((r): r is T => r !== undefined);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--primary-line)] bg-primary-soft px-2 py-1.5">
      <span className="text-xs font-medium tabular-nums text-fg">
        {fmt.t(t.selectedCount, { n: selection.ids.length })}
        {selection.full && <span className="ml-1 font-normal text-fg-muted">{fmt.t(t.selectionCap, { n: selection.max })}</span>}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="primary"
          size="sm"
          className="gap-1.5"
          // Two is the smallest number that is a comparison. One ticked row is a selection in progress.
          disabled={picked.length < 2}
          onClick={() => setOpen(true)}
        >
          <Columns3 className="size-3.5" />
          {t.compareLabel}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1" onClick={selection.clear}>
          <X className="size-3.5" />
          <span className="hidden sm:inline">{t.clearSelection}</span>
        </Button>
      </div>
      <CompareSheet rows={picked} specs={specs} open={open} onOpenChange={setOpen} heading={heading} />
    </div>
  );
}
