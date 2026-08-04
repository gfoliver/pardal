import type { ReactNode } from "react";
import { useApp } from "../../app/AppProviders";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { usefulSpecs, winners } from "./compare";
import { defaultCell } from "./DataGrid";
import type { FieldSpec } from "./types";

/**
 * The same rows, turned on their side.
 *
 * A table is for scanning a column down a squad; this is for the other question, the one a manager
 * actually agonises over — these two, which one — where the fields are the rows and the players are
 * the columns. It reads from the SAME `FieldSpec` list the grid does, so a comparison cannot show a
 * number the table formats differently, and a field added to a screen appears here for free.
 *
 * Every declared field is offered, not just the visible columns. Hiding the pace column is a decision
 * about a list of thirty; when the choice is down to two players, the answer is very often in a field
 * he did not want taking up width.
 */

export function CompareSheet<T>({ rows, specs, open, onOpenChange, heading }: {
  /** The picked rows, in the order they were picked. */
  rows: readonly T[];
  specs: readonly FieldSpec<T>[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the column head for one row — the identity of the thing being compared. */
  heading: (row: T) => ReactNode;
}) {
  const { t } = useApp();
  const fields = usefulSpecs(specs, rows);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the default dialog, and it grows with the number of columns rather than squeezing
          four players into the width of two. */}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.compareTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {/* The label column is pinned, because losing track of WHICH field a row of numbers
                    belongs to is the one way this table can become useless. */}
                <th className="sticky left-0 top-0 z-[3] w-28 border-b border-border bg-surface-2 px-3 py-2 text-left" />
                {rows.map((row, i) => (
                  <th key={i} className="sticky top-0 z-[2] min-w-[9rem] border-b border-l border-border bg-surface-2 px-3 py-2 text-left align-bottom font-medium">
                    {heading(row)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((spec) => {
                const won = winners(spec, rows);
                return (
                  <tr key={spec.id} className="group">
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] border-b border-hairline bg-surface px-3 py-1.5 text-left text-xs font-normal text-fg-muted group-hover:bg-surface-2"
                    >
                      {spec.longLabel ?? spec.label}
                    </th>
                    {rows.map((row, i) => (
                      <td
                        key={i}
                        className={cn(
                          "border-b border-l border-hairline px-3 py-1.5 align-middle",
                          won.has(i) ? "bg-primary-soft font-semibold text-fg" : "text-fg-muted",
                        )}
                      >
                        {/* Same fallback the grid uses, so a field with no `cell` cannot print one way
                            in the table and another here. */}
                        {spec.cell ? spec.cell(row) : defaultCell(spec.value(row))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
