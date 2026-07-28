import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "./input";
import { Button } from "./button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting (number or string); enables sorting when present. */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  className?: string;
}

/**
 * A chip filter over one facet of the data (position, status, …).
 *
 * Kept on the shared table rather than in each screen so squad, scouting and
 * transfers filter the same way — and so adding a facet is a prop, not a
 * bespoke row of buttons per screen.
 */
export interface Facet<T> {
  key: string;
  /** Chips to offer, in display order. `value` is matched against `valueOf`. */
  options: { value: string; label: React.ReactNode }[];
  valueOf: (row: T) => string;
  /** Label for the "no filter" chip. */
  allLabel?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeRowId?: string;
  /** Substring-search across these row string values. */
  filterText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Chip filters shown beside the search box. */
  facets?: Facet<T>[];
  /** Rendered in a trailing column — the row's own menu. */
  rowActions?: (row: T) => React.ReactNode;
  /** Wrap each row (e.g. in a context-menu trigger). */
  rowWrapper?: (row: T, rendered: React.ReactNode) => React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  className?: string;
}

/**
 * Generic in-memory data table: click-to-sort headers, optional text filter and
 * pagination. Built on the Onze <Table>. Fine for the career's modest lists;
 * virtualization can come later if a pool ever gets large.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  activeRowId,
  filterText,
  searchPlaceholder,
  facets,
  rowActions,
  rowWrapper,
  initialSort,
  pageSize = 25,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [page, setPage] = React.useState(0);
  /** facet key → selected value ("" = no filter). */
  const [chips, setChips] = React.useState<Record<string, string>>({});

  const filtered = React.useMemo(() => {
    const q = filterText && query.trim() ? query.trim().toLowerCase() : null;
    const active = Object.entries(chips).filter(([, v]) => v);
    if (!q && active.length === 0) return rows;
    return rows.filter((r) => {
      if (q && !filterText!(r).toLowerCase().includes(q)) return false;
      for (const [key, value] of active) {
        const facet = facets?.find((f) => f.key === key);
        if (facet && facet.valueOf(r) !== value) return false;
      }
      return true;
    });
  }, [rows, filterText, query, chips, facets]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clamped = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clamped * pageSize, clamped * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const alignCls = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(filterText || facets?.length) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterText && (
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder ?? "Search…"}
              className="max-w-xs"
            />
          )}
          {facets?.map((f) => (
            <div key={f.key} className="flex flex-wrap gap-1">
              {[{ value: "", label: f.allLabel ?? "All" }, ...f.options].map((o) => {
                const on = (chips[f.key] ?? "") === o.value;
                return (
                  <button
                    key={o.value || "__all"}
                    onClick={() => {
                      setChips((c) => ({ ...c, [f.key]: o.value }));
                      setPage(0);
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-caps transition-colors",
                      on ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted hover:text-fg",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={alignCls(c.align)}>
                {c.sortValue ? (
                  <button
                    className="inline-flex items-center gap-1 uppercase tracking-caps hover:text-fg"
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.header}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
                    ) : (
                      <ChevronsUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </TableHead>
            ))}
            {rowActions && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => {
            const id = getRowId(row);
            const rendered = (
              <TableRow
                key={id}
                data-active={activeRowId === id}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(alignCls(c.align), c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
                {rowActions && (
                  <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </TableCell>
                )}
              </TableRow>
            );
            return rowWrapper ? <React.Fragment key={id}>{rowWrapper(row, rendered)}</React.Fragment> : rendered;
          })}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs text-fg-muted">
          <span className="tabular-nums">
            {clamped + 1} / {pageCount}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>
              Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={clamped >= pageCount - 1} onClick={() => setPage(clamped + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
