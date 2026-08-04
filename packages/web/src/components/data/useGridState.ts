import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldSpec, Filter, GridQuery, Sort } from "./types";

/**
 * A list's layout, remembered.
 *
 * Which columns are on, how it is ordered and what is filtered are decisions the manager makes once
 * and expects to still be true tomorrow — a squad screen that forgets it should show attributes is a
 * squad screen he has to configure every session.
 *
 * The free-text box is deliberately NOT remembered. A persisted search would restore a list with
 * most of the squad missing and an explanation two clicks away, whereas a filter chip says out loud
 * what it is doing and can be dismissed. Same reasoning, opposite conclusion, because a chip is
 * visible and a text box you did not type into is not.
 */

const KEY = (id: string) => `onze.grid.${id}`;

/** Only the parts worth surviving a reload. */
interface Stored {
  /** Column ids, on. `null` = never customised, so follow the screen's own defaults. */
  readonly visible: readonly string[] | null;
  readonly sort: Sort | null;
  readonly filters: readonly Filter[];
}

function read(id: string): Stored {
  const blank: Stored = { visible: null, sort: null, filters: [] };
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return blank;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      visible: Array.isArray(parsed.visible) ? parsed.visible.filter((v): v is string => typeof v === "string") : null,
      sort: isSort(parsed.sort) ? parsed.sort : null,
      filters: Array.isArray(parsed.filters) ? parsed.filters.filter(isFilter) : [],
    };
  } catch {
    // A layout is not worth a crash. Corrupt or absent, start from the screen's defaults.
    return blank;
  }
}

const isSort = (v: unknown): v is Sort =>
  typeof v === "object" && v !== null && typeof (v as Sort).field === "string" && ((v as Sort).dir === "asc" || (v as Sort).dir === "desc");

/** Validated on the way IN, because a stored filter is untrusted input from an older build. */
function isFilter(v: unknown): v is Filter {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Filter;
  if (typeof f.field !== "string") return false;
  if (f.kind === "range") {
    return (f.min === undefined || typeof f.min === "number") && (f.max === undefined || typeof f.max === "number");
  }
  if (f.kind === "enum") return Array.isArray(f.values) && f.values.every((x) => typeof x === "string");
  if (f.kind === "bool") return typeof f.value === "boolean";
  return false;
}

export interface GridState<T> {
  /** Search, filters and sort, ready to hand to `runQuery`. */
  readonly query: GridQuery;
  /** The columns to draw, in the screen's declared order — not the order they were switched on. */
  readonly columns: readonly FieldSpec<T>[];
  readonly visibleIds: readonly string[];
  setText: (text: string) => void;
  /** Sort by a field; asking for the field already sorted flips it, and a third ask clears it. */
  toggleSort: (field: string) => void;
  setFilter: (filter: Filter) => void;
  clearFilter: (field: string) => void;
  clearAllFilters: () => void;
  toggleColumn: (id: string) => void;
  /** Back to the screen's own defaults, columns and filters both. */
  reset: () => void;
  /** True when anything is narrowing the list, so the UI can offer a way out of it. */
  readonly narrowed: boolean;
}

export function useGridState<T>(gridId: string, specs: readonly FieldSpec<T>[], defaultSort?: Sort): GridState<T> {
  const [stored, setStored] = useState<Stored>(() => read(gridId));
  const [text, setText] = useState("");

  // Written on every change rather than on unmount: a manager who closes the tab from a screen he
  // has just arranged should not lose the arrangement.
  useEffect(() => {
    try {
      localStorage.setItem(gridId ? KEY(gridId) : KEY("default"), JSON.stringify(stored));
    } catch {
      /* private mode, quota — a layout is not worth an error */
    }
  }, [gridId, stored]);

  const visibleIds = useMemo(() => {
    const declared = specs.filter((s) => !s.hiddenByDefault).map((s) => s.id);
    if (!stored.visible) return declared;
    // Intersected with what the screen still declares, so a field removed in a new build disappears
    // instead of leaving a hole, and `required` columns come back even if an old layout dropped them.
    const on = new Set(stored.visible);
    return specs.filter((s) => s.required || on.has(s.id)).map((s) => s.id);
  }, [specs, stored.visible]);

  const columns = useMemo(() => {
    const on = new Set(visibleIds);
    // Declared order, always. Ordering by when each column was switched on would rearrange the table
    // under the manager as he picks.
    return specs.filter((s) => on.has(s.id));
  }, [specs, visibleIds]);

  const sort = stored.sort ?? defaultSort ?? null;

  const toggleSort = useCallback(
    (field: string) =>
      setStored((s) => {
        const cur = s.sort ?? defaultSort ?? null;
        if (cur?.field !== field) return { ...s, sort: { field, dir: "desc" } };
        if (cur.dir === "desc") return { ...s, sort: { field, dir: "asc" } };
        return { ...s, sort: null };
      }),
    [defaultSort],
  );

  const setFilter = useCallback(
    (filter: Filter) =>
      setStored((s) => ({ ...s, filters: [...s.filters.filter((f) => f.field !== filter.field), filter] })),
    [],
  );
  const clearFilter = useCallback(
    (field: string) => setStored((s) => ({ ...s, filters: s.filters.filter((f) => f.field !== field) })),
    [],
  );
  const clearAllFilters = useCallback(() => {
    setStored((s) => ({ ...s, filters: [] }));
    setText("");
  }, []);

  const toggleColumn = useCallback(
    (id: string) =>
      setStored((s) => {
        const current = new Set(s.visible ?? specs.filter((x) => !x.hiddenByDefault).map((x) => x.id));
        if (current.has(id)) current.delete(id);
        else current.add(id);
        return { ...s, visible: [...current] };
      }),
    [specs],
  );

  const reset = useCallback(() => {
    setStored({ visible: null, sort: null, filters: [] });
    setText("");
  }, []);

  const query = useMemo<GridQuery>(() => ({ text, filters: stored.filters, sort }), [text, stored.filters, sort]);

  return {
    query,
    columns,
    visibleIds,
    setText,
    toggleSort,
    setFilter,
    clearFilter,
    clearAllFilters,
    toggleColumn,
    reset,
    narrowed: text.trim().length > 0 || stored.filters.length > 0,
  };
}
