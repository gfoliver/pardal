import { Fragment, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { cardFields } from "./cards";
import { INHERIT_ALIGN, defaultCell } from "./cell";
import { usefulSpecs } from "./compare";
import type { GridState } from "./useGridState";
import type { Selection } from "./useSelection";

/**
 * The same list, drawn for a phone.
 *
 * The table's answer for a narrow screen was to pin the first column and scroll the rest sideways. It
 * was the wrong answer, and the way it failed is worth recording: the pinned name is the WIDEST column
 * on the screen, so on a 390px phone it ate most of the width and left a slit for the numbers the
 * manager had come to read. Scanning was impossible in both directions at once — you either saw whose
 * row it was or saw the number, never both.
 *
 * So a card, with the identity on its own line where it has room, and a small fixed set of fields
 * underneath in labelled slots. Everything the table can do is still reachable: search and filters come
 * from the same `FilterBar`, ordering moves into a control of its own (the table put it in the header,
 * and the header is gone), the tick for a comparison stays on the card, and the fields that did not fit
 * are one tap away in a sheet rather than off the edge of a scroll.
 *
 * The rows are virtualised for the same reason the table's are: the transfer market is six hundred
 * players, and a phone is the device least able to mount them all.
 */

/** Seeds the scrollbar; the virtualiser measures the real height. Two lines plus the padding. */
const CARD_H = 86;

export interface CardListProps<T> {
  rows: readonly T[];
  state: GridState<T>;
  rowKey: (row: T) => string;
  rowWrapper?: (row: T, children: ReactNode) => ReactNode;
  isActive?: (row: T) => boolean;
  selection?: Selection;
  className?: string;
}

/**
 * How the list is ordered, and how to change it.
 *
 * On a table this is the header, and it costs nothing because the header is already on screen. Cards
 * have no header, so without this the list on a phone would be stuck in whatever order the screen
 * declared as its default — losing a capability the desktop has is not an adaptation.
 */
function SortMenu<T>({ state }: { state: GridState<T> }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const sort = state.query.sort;
  const current = sort ? state.columns.find((s) => s.id === sort.field) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowUpDown className="size-3.5" />
          <span className="max-w-[10rem] truncate">
            {current ? `${t.sortedBy} ${current.label}` : t.sortBy}
          </span>
          {sort && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-0.5">
          {state.columns.map((s) => {
            const on = sort?.field === s.id;
            return (
              <button
                key={s.id}
                type="button"
                // Not closed on select: tapping the field already sorted flips the direction, which is
                // the second half of the same gesture. Sorting the wrong way round and having to reopen
                // a menu to say "no, the other way" is the friction this avoids.
                onClick={() => state.toggleSort(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-surface-2",
                  on && "font-semibold text-fg",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s.longLabel ?? s.label}</span>
                {on && (sort!.dir === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Every field this row has something to say about. The reason the card can afford to show four. */
function DetailSheet<T>({ row, state, onClose }: { row: T | null; state: GridState<T>; onClose: () => void }) {
  const { t } = useApp();
  const identity = state.specs[0];
  // `usefulSpecs` drops the identity (it is the title here) and every field this row is blank on, so
  // the sheet is a list of facts rather than a list of dashes.
  const fields = row === null ? [] : usefulSpecs(state.specs, [row]);

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-3 p-4">
        {/* `pr-11`, not `pr-8`: the close button is 36px wide and sits 6px in. */}
        <SheetTitle className="pr-11 text-base">
          {row !== null && identity ? (identity.cell ? identity.cell(row) : defaultCell(identity.value(row))) : t.allDetails}
        </SheetTitle>
        <dl className="min-h-0 flex-1 overflow-y-auto">
          {row !== null &&
            fields.map((spec) => (
              <div
                key={spec.id}
                className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0"
              >
                <dt className="min-w-0 shrink text-xs text-fg-muted">{spec.longLabel ?? spec.label}</dt>
                <dd className={cn("shrink-0 text-right text-sm text-fg", INHERIT_ALIGN)}>
                  {spec.cell ? spec.cell(row) : defaultCell(spec.value(row))}
                </dd>
              </div>
            ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
}

export function CardList<T>({ rows, state, rowKey, rowWrapper, isActive, selection, className }: CardListProps<T>) {
  const { t } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<T | null>(null);
  const { columns, query } = state;
  const identity = columns[0];
  const fields = cardFields(columns, query.sort);

  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_H,
    overscan: 8,
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
    <div className="flex flex-col gap-1.5">
      <SortMenu state={state} />
      <div ref={scrollRef} className={cn("overflow-y-auto", className)}>
        <div className="relative" style={{ height: virtual.getTotalSize() }}>
          {items.map((item) => {
            const row = rows[item.index]!;
            const key = rowKey(row);
            const active = isActive?.(row) ?? false;
            const picked = selection?.has(key) ?? false;
            const card = (
              <div
                ref={virtual.measureElement}
                data-index={item.index}
                data-active={active || undefined}
                className="absolute left-0 top-0 w-full pb-1.5"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div
                  className={cn(
                    "flex items-stretch gap-2 rounded-lg border px-2.5 py-2",
                    active || picked ? "border-[var(--primary-line)] bg-primary-soft" : "border-border bg-surface",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      {selection && (
                        <Checkbox
                          checked={picked}
                          disabled={!picked && selection.full}
                          onCheckedChange={() => selection.toggle(key)}
                          aria-label={String(identity?.value(row) ?? t.compareLabel)}
                        />
                      )}
                      {/*
                        The identity cell verbatim, links and badges and all. It is NOT wrapped in the
                        button that opens the sheet: the name is a link to the profile, an anchor inside
                        a button is invalid HTML, and one tap would fire both. The disclosure gets its
                        own element to the right instead — see the grid's note on why nothing here does
                        anything it does not say it does.
                      */}
                      <div className={cn("min-w-0 flex-1 truncate text-left font-medium", INHERIT_ALIGN)}>
                        {identity && (identity.cell ? identity.cell(row) : defaultCell(identity.value(row)))}
                      </div>
                    </div>
                    {/*
                      Fixed slots, in the screen's declared order, so the third value down is the same
                      field on every card and the list stays scannable by column.
                    */}
                    <dl className="grid grid-cols-4 gap-x-2">
                      {fields.map((spec) => (
                        <div key={spec.id} className="min-w-0">
                          <dt className="caps truncate text-2xs text-fg-faint">{spec.label}</dt>
                          <dd className={cn("truncate text-left text-xs text-fg-muted", INHERIT_ALIGN)}>
                            {spec.cell ? spec.cell(row) : defaultCell(spec.value(row))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  {/* Full height, so the target is the card's whole right edge rather than an icon. */}
                  <button
                    type="button"
                    aria-label={t.allDetails}
                    onClick={() => setDetail(row)}
                    className="-mr-1 grid w-8 shrink-0 place-items-center rounded-md text-fg-faint hover:bg-surface-2 hover:text-fg"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            );
            return <Fragment key={key}>{rowWrapper ? rowWrapper(row, card) : card}</Fragment>;
          })}
        </div>
      </div>
      <DetailSheet row={detail} state={state} onClose={() => setDetail(null)} />
    </div>
  );
}
