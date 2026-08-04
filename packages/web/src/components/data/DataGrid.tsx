import { Fragment, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { cn } from "../../lib/utils";
import type { FieldSpec, FieldValue } from "./types";
import type { GridState } from "./useGridState";

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

export interface DataGridProps<T> {
  rows: readonly T[];
  state: GridState<T>;
  /** Stable identity per row — never the index, which reorders on every sort. */
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Wraps each row, for a context menu. Must render its child as the row element. */
  rowWrapper?: (row: T, children: ReactNode) => ReactNode;
  /** Marks the row as the one being looked at elsewhere (the selected player). */
  isActive?: (row: T) => boolean;
  /** Max height of the scroll area. A grid inside a card wants to be shorter than the page. */
  className?: string;
}

/** Default rendering when a field declares no `cell`: the value, or an em dash for unknown. */
function defaultCell(v: FieldValue): ReactNode {
  if (v === undefined || v === "") return <span className="text-fg-faint">—</span>;
  if (typeof v === "boolean") return v ? "✓" : <span className="text-fg-faint">—</span>;
  return String(v);
}

const alignClass = (a: FieldSpec<unknown>["align"]) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

/**
 * Anything a person can operate inside a cell.
 *
 * A row is clickable AND carries controls — an actions menu, a link to the club, a checkbox — and the
 * click on a control bubbles straight up to the row. On the squad list that meant every single action
 * opened the player's profile instead of doing what it said: the menu even opened first, then the
 * profile replaced it. A control owns its own click.
 */
const CONTROL = 'button,a,input,select,textarea,label,[role="button"],[role="menuitem"],[role="checkbox"]';

function handleRowClick<T>(e: React.MouseEvent<HTMLTableRowElement>, row: T, onRowClick: (row: T) => void): void {
  // `closest` from the actual target, so a control nested inside a cell counts however deep it is —
  // an icon inside a button inside a tooltip trigger is still that button's click.
  if ((e.target as HTMLElement).closest(CONTROL)) return;
  onRowClick(row);
}

export function DataGrid<T>({ rows, state, rowKey, onRowClick, rowWrapper, isActive, className }: DataGridProps<T>) {
  const { t } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columns, query } = state;

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
            {columns.map((spec, i) => {
              const sorted = query.sort?.field === spec.id;
              return (
                <th
                  key={spec.id}
                  scope="col"
                  style={{ width: spec.width, minWidth: spec.width, left: i === 0 ? 0 : undefined, height: HEAD_H }}
                  className={cn(
                    // Sticky in both axes: the header stays while you scroll down, the first column
                    // while you scroll across, and the corner cell must do both at once.
                    "sticky top-0 z-10 border-b border-border bg-surface-2 px-2 align-middle",
                    "caps whitespace-nowrap text-fg-faint",
                    i === 0 && "left-0 z-20",
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
              <td colSpan={columns.length} />
            </tr>
          )}
          {items.map((item) => {
            const row = rows[item.index]!;
            const active = isActive?.(row) ?? false;
            const tr = (
              <tr
                ref={virtual.measureElement}
                data-index={item.index}
                data-active={active || undefined}
                onClick={onRowClick ? (e) => handleRowClick(e, row, onRowClick) : undefined}
                className={cn(
                  "group",
                  onRowClick && "cursor-pointer",
                  active ? "bg-primary-soft" : "hover:bg-surface-2",
                )}
              >
                {columns.map((spec, i) => (
                  <td
                    key={spec.id}
                    style={{ width: spec.width, minWidth: spec.width, left: i === 0 ? 0 : undefined }}
                    className={cn(
                      "border-b border-hairline px-2 py-1.5 align-middle",
                      // The pinned cell carries its own background, or the columns sliding under it
                      // show through.
                      i === 0 && "sticky left-0 z-10 bg-surface group-hover:bg-surface-2",
                      i === 0 && active && "bg-primary-soft",
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
            return <Fragment key={rowKey(row)}>{rowWrapper ? rowWrapper(row, tr) : tr}</Fragment>;
          })}
          {items.length > 0 && (
            <tr aria-hidden style={{ height: Math.max(0, virtual.getTotalSize() - items[items.length - 1]!.end) }}>
              <td colSpan={columns.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
