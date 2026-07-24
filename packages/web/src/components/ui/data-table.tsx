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

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeRowId?: string;
  /** Substring-search across these row string values. */
  filterText?: (row: T) => string;
  searchPlaceholder?: string;
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
  initialSort,
  pageSize = 25,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!filterText || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => filterText(r).toLowerCase().includes(q));
  }, [rows, filterText, query]);

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => {
            const id = getRowId(row);
            return (
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
              </TableRow>
            );
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
