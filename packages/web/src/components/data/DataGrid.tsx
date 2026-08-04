import { Fragment, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Checkbox } from "../ui/checkbox";
import { cn } from "../../lib/utils";
import type { FieldSpec, FieldValue } from "./types";
import type { GridState } from "./useGridState";
import type { Selection } from "./useSelection";

/**
 * The table every list is drawn with.
 *
 * Virtualised because the transfer market is the whole league — six hundred and forty players, each
 * with up to twenty columns — and mounting thirteen thousand cells to show twenty rows is how a
 * screen becomes unusable on a phone. Only the rows in view exist.
 *
 * Scrolls horizontally with the FIRST column pinned, rather than collapsing into cards on a narrow
 * screen. A card list cannot be scanned down a column, and comparing one number across a squad is
 * the entire reason a manager opens a table; keeping the name anchored means he never loses track of
 * whose row he is reading while he swipes to the attribute he came for.
 */

/** Estimated row height. The virtualiser measures the real one, this only seeds the scrollbar. */
const ROW_H = 40;
const HEAD_H = 34;
/** The tick column. Fixed, because the first real column's sticky offset is measured from it. */
const CHECK_W = 34;

/**
 * There is deliberately no `onRowClick`.
 *
 * A row used to be one big link to the thing it described, and it was wrong three separate ways. A
 * row holds an actions menu, links to other clubs, tooltips, and — through React's portals, which
 * bubble along the COMPONENT tree rather than the DOM — the backdrop and body of any dialog those
 * actions open. Each of those clicks arrived as a click on the row, so operating a control navigated
 * away from what you were operating. Two guards were added to keep them apart and a third case
 * turned up anyway.
 *
 * So the link is the NAME, in the cell, where it is visible and hoverable and obviously a link.
 * Nothing else in the row does anything it does not say it does.
 */
export interface DataGridProps<T> {
  rows: readonly T[];
  state: GridState<T>;
  /** Stable identity per row — never the index, which reorders on every sort. */
  rowKey: (row: T) => string;
  /** Wraps each row, for a context menu. Must render its child as the row element. */
  rowWrapper?: (row: T, children: ReactNode) => ReactNode;
  /** Marks the row as the one being looked at elsewhere (the selected player). */
  isActive?: (row: T) => boolean;
  /**
   * Offer a tick per row, for picking a few out to compare.
   *
   * Absent on lists where that is not a question worth asking — nobody compares two inbox messages.
   * The tick column pins alongside the first column rather than replacing it as the pinned one: the
   * name has to stay anchored while he scrolls across, which is the entire reason anything is pinned.
   */
  selection?: Selection;
  /** Max height of the scroll area. A grid inside a card wants to be shorter than the page. */
  className?: string;
}

/** Default rendering when a field declares no `cell`: the value, or an em dash for unknown. */
export function defaultCell(v: FieldValue): ReactNode {
  if (v === undefined || v === "") return <span className="text-fg-faint">—</span>;
  if (typeof v === "boolean") return v ? "✓" : <span className="text-fg-faint">—</span>;
  return String(v);
}

const alignClass = (a: FieldSpec<unknown>["align"]) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

export function DataGrid<T>({ rows, state, rowKey, rowWrapper, isActive, selection, className }: DataGridProps<T>) {
  const { t } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columns, query } = state;
  /** Where the first real column starts: hard against the edge, or after the tick column. */
  const firstLeft = selection ? CHECK_W : 0;
  const span = columns.length + (selection ? 1 : 0);

  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    // Enough rows above and below to survive a flick without a blank band.
    overscan: 12,
  });

  if (rows.length === 0) {
    return (
      <div className="grid place-items-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-fg-muted">{t.noMatches}</p>
        {state.narrowed && <p className="text-xs text-fg-faint">{t.noMatchesHint}</p>}
      </div>
    );
  }

  const items = virtual.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={cn("relative overflow-auto rounded-lg border border-border bg-surface", className)}
    >
      <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: "max-content" }}>
        <thead>
          <tr>
            {selection && (
              // No select-all: the point of a selection here is a comparison of two to four, so
              // "tick everything" would be a control for something the feature cannot do.
              <th
                scope="col"
                aria-label={t.compareLabel}
                style={{ width: CHECK_W, minWidth: CHECK_W, left: 0, height: HEAD_H }}
                className="sticky left-0 top-0 z-[3] border-b border-border bg-surface-2"
              />
            )}
            {columns.map((spec, i) => {
              const sorted = query.sort?.field === spec.id;
              return (
                <th
                  key={spec.id}
                  scope="col"
                  style={{ width: spec.width, minWidth: spec.width, left: i === 0 ? firstLeft : undefined, height: HEAD_H }}
                  className={cn(
                    // Sticky in both axes: the header stays while you scroll down, the first column
                    // while you scroll across, and the corner cell must do both at once.
                    //
                    // The z-index is deliberately TINY. It only has to beat this table's own rows,
                    // and a header that competes app-wide is a header that paints over dialogs: when
                    // the layer tokens went missing these were `z-10`/`z-20` and did exactly that.
                    "sticky top-0 z-[2] border-b border-border bg-surface-2 px-2 align-middle",
                    "caps whitespace-nowrap text-fg-faint",
                    // `left` is inline, not a utility: with a tick column it is an offset, not zero.
                    i === 0 && "z-[3]",
                    alignClass(spec.align),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => state.toggleSort(spec.id)}
                    // The whole header is the target, so sorting never needs a precise tap.
                    className={cn(
                      "inline-flex w-full items-center gap-1 outline-none hover:text-fg focus-visible:text-fg",
                      spec.align === "right" && "justify-end",
                      spec.align === "center" && "justify-center",
                      sorted && "text-fg",
                    )}
                    title={spec.longLabel ?? spec.label}
                    aria-sort={sorted ? (query.sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className="truncate">{spec.label}</span>
                    {sorted &&
                      (query.sort!.dir === "asc" ? (
                        <ArrowUp className="size-3 shrink-0" />
                      ) : (
                        <ArrowDown className="size-3 shrink-0" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Spacer rows stand in for everything scrolled past, so the scrollbar is the real length. */}
          {items.length > 0 && items[0]!.start > 0 && (
            <tr aria-hidden style={{ height: items[0]!.start }}>
              <td colSpan={span} />
            </tr>
          )}
          {items.map((item) => {
            const row = rows[item.index]!;
            const active = isActive?.(row) ?? false;
            const key = rowKey(row);
            const picked = selection?.has(key) ?? false;
            const tr = (
              <tr
                ref={virtual.measureElement}
                data-index={item.index}
                data-active={active || undefined}
                className={cn("group", active || picked ? "bg-primary-soft" : "hover:bg-surface-2")}
              >
                {selection && (
                  <td
                    style={{ width: CHECK_W, minWidth: CHECK_W, left: 0 }}
                    className={cn(
                      "sticky z-[1] border-b border-hairline px-2 py-1.5 text-center align-middle",
                      picked ? "bg-primary-soft" : "bg-surface group-hover:bg-surface-2",
                    )}
                  >
                    <Checkbox
                      checked={picked}
                      // Disabled at the cap, which is how the limit announces itself: the ticks he can
                      // no longer add stop responding, rather than a click doing nothing invisibly.
                      disabled={!picked && selection.full}
                      onCheckedChange={() => selection.toggle(key)}
                      // The first column is the identity of the row, so its value names this tick.
                      aria-label={String(columns[0]?.value(row) ?? t.compareLabel)}
                    />
                  </td>
                )}
                {columns.map((spec, i) => (
                  <td
                    key={spec.id}
                    style={{ width: spec.width, minWidth: spec.width, left: i === 0 ? firstLeft : undefined }}
                    className={cn(
                      "border-b border-hairline px-2 py-1.5 align-middle",
                      // The pinned cell carries its own background, or the columns sliding under it
                      // show through.
                      i === 0 && "sticky z-[1] bg-surface group-hover:bg-surface-2",
                      i === 0 && (active || picked) && "bg-primary-soft",
                      i === 0 ? "font-medium" : "text-fg-muted",
                      alignClass(spec.align),
                    )}
                  >
                    {spec.cell ? spec.cell(row) : defaultCell(spec.value(row))}
                  </td>
                ))}
              </tr>
            );
            // The key goes on the Fragment, not the `<tr>`: a `rowWrapper` (a context-menu trigger)
            // puts its own element around the row, and that outer element is what the list keys on.
            return <Fragment key={key}>{rowWrapper ? rowWrapper(row, tr) : tr}</Fragment>;
          })}
          {items.length > 0 && (
            <tr aria-hidden style={{ height: Math.max(0, virtual.getTotalSize() - items[items.length - 1]!.end) }}>
              <td colSpan={span} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
