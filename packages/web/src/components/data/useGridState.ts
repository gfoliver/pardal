import { useCallback, useEffect, useMemo, useState } from "react";
import { isIdle } from "./query";
import type { FieldSpec, Filter, GridQuery, SavedView, Sort } from "./types";

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
 *
 * Beside the one live arrangement sit his named ones (`SavedView`), in the same record and under the
 * same key: they belong to this screen and nowhere else, because a view is a list of field ids only
 * this screen declares.
 */

const KEY = (id: string) => `onze.grid.${id}`;

/** Only the parts worth surviving a reload. */
interface Stored {
  /** Column ids, on. `null` = never customised, so follow the screen's own defaults. */
  readonly visible: readonly string[] | null;
  readonly sort: Sort | null;
  readonly filters: readonly Filter[];
  /** The manager's named arrangements. Kept beside the live one, in the same record. */
  readonly views: readonly SavedView[];
}

function read(id: string): Stored {
  const blank: Stored = { visible: null, sort: null, filters: [], views: [] };
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return blank;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      visible: Array.isArray(parsed.visible) ? parsed.visible.filter((v): v is string => typeof v === "string") : null,
      sort: isSort(parsed.sort) ? parsed.sort : null,
      filters: Array.isArray(parsed.filters) ? parsed.filters.filter(isFilter) : [],
      views: Array.isArray(parsed.views) ? parsed.views.filter(isView) : [],
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

/**
 * A stored view, validated whole rather than repaired.
 *
 * Atomic on purpose: a view is a named promise about what the list will show, and a half-repaired one
 * — say with its rating filter quietly dropped — would keep the name while showing something else.
 * Better to lose the view and let him save it again than to lie about it.
 */
function isView(v: unknown): v is SavedView {
  if (typeof v !== "object" || v === null) return false;
  const x = v as SavedView;
  return (
    typeof x.name === "string" &&
    x.name.trim() !== "" &&
    Array.isArray(x.visible) &&
    x.visible.every((s) => typeof s === "string") &&
    (x.sort === null || isSort(x.sort)) &&
    Array.isArray(x.filters) &&
    x.filters.every(isFilter)
  );
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const canonFilter = (f: Filter): string =>
  f.kind === "range"
    ? `${f.field}|range|${f.min ?? ""}|${f.max ?? ""}`
    : f.kind === "enum"
      ? `${f.field}|enum|${[...f.values].sort().join(",")}`
      : `${f.field}|bool|${f.value}`;

/**
 * A canonical fingerprint of an arrangement, so "which view am I looking at" is DERIVED.
 *
 * A remembered `activeView` id goes stale the moment a filter is touched, and then the menu claims to
 * be showing a view it is not — a bug that cannot happen if the answer is recomputed from the state.
 *
 * Order-insensitive on both axes, because `setFilter` appends and the order he clicked in is not part
 * of what he saved. Idle filters are excluded: opening the add-filter menu inserts one immediately,
 * and that must not read as a change.
 */
function signature(visible: readonly string[], sort: Sort | null, filters: readonly Filter[]): string {
  return JSON.stringify({
    v: [...visible].sort(),
    s: sort ? [sort.field, sort.dir] : null,
    f: filters.filter((f) => !isIdle(f)).map(canonFilter).sort(),
  });
}

export interface GridState<T> {
  /** Search, filters and sort, ready to hand to `runQuery`. */
  readonly query: GridQuery;
  /** The columns to draw, in the screen's declared order — not the order they were switched on. */
  readonly columns: readonly FieldSpec<T>[];
  /**
   * EVERY declared field, hidden ones included.
   *
   * The grid draws `columns`; the card view's detail sheet draws all of these, because "show me
   * everything about him" is the whole point of opening it and a field being off the table is a
   * statement about the table, not about the player.
   */
  readonly specs: readonly FieldSpec<T>[];
  readonly visibleIds: readonly string[];
  setText: (text: string) => void;
  /** Sort by a field; asking for the field already sorted flips it, and a third ask clears it. */
  toggleSort: (field: string) => void;
  setFilter: (filter: Filter) => void;
  /**
   * Add or drop ONE value of an `enum` filter.
   *
   * Exists because the alternative loses ticks. The menu used to read the current values off the filter
   * it was handed and write back a whole new one, which is a read-modify-write over a prop: two ticks
   * inside one React batch both start from the same list, and the second silently discards the first.
   * Doing the arithmetic inside the updater cannot race with itself.
   */
  toggleEnum: (field: string, value: string) => void;
  clearFilter: (field: string) => void;
  clearAllFilters: () => void;
  toggleColumn: (id: string) => void;
  /** Back to the screen's own defaults, columns and filters both. Saved views survive it. */
  reset: () => void;
  readonly views: readonly SavedView[];
  /** The saved view the current arrangement matches, by name. Derived, so it is never stale. */
  readonly activeView: string | null;
  /** Snapshot the current arrangement under a name. An existing name is overwritten. */
  saveView: (name: string) => void;
  applyView: (name: string) => void;
  deleteView: (name: string) => void;
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
  const toggleEnum = useCallback(
    (field: string, value: string) =>
      setStored((s) => {
        const cur = s.filters.find((f) => f.field === field);
        const values = new Set(cur?.kind === "enum" ? cur.values : []);
        if (values.has(value)) values.delete(value);
        else values.add(value);
        return { ...s, filters: [...s.filters.filter((f) => f.field !== field), { kind: "enum", field, values: [...values] }] };
      }),
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

  // Spreads rather than replaces, because a layout reset must not throw away saved views. They are
  // the one thing here the manager typed a name for.
  const reset = useCallback(() => {
    setStored((s) => ({ ...s, visible: null, sort: null, filters: [] }));
    setText("");
  }, []);

  const saveView = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setStored((s) => {
        // The EFFECTIVE columns, not `s.visible`, which is null until he touches the picker. A view
        // that stored null would drift with the screen's defaults instead of showing what he saved.
        const view: SavedView = {
          name: trimmed,
          visible: [...visibleIds],
          sort: s.sort ?? defaultSort ?? null,
          filters: s.filters.filter((f) => !isIdle(f)),
        };
        const at = s.views.findIndex((v) => sameName(v.name, trimmed));
        // Overwritten in place, so re-saving a view does not move it down the list.
        return { ...s, views: at >= 0 ? s.views.map((v, i) => (i === at ? view : v)) : [...s.views, view] };
      });
    },
    [visibleIds, defaultSort],
  );

  const applyView = useCallback(
    (name: string) =>
      setStored((s) => {
        const v = s.views.find((x) => sameName(x.name, name));
        // The search box is left alone on purpose. It is a control he can see, with his own words in
        // it; clearing what he is looking at is more surprising than leaving it.
        return v ? { ...s, visible: v.visible, sort: v.sort, filters: v.filters } : s;
      }),
    [],
  );

  const deleteView = useCallback(
    (name: string) => setStored((s) => ({ ...s, views: s.views.filter((v) => !sameName(v.name, name)) })),
    [],
  );

  const activeView = useMemo(() => {
    const now = signature(visibleIds, sort, stored.filters);
    return stored.views.find((v) => signature(v.visible, v.sort, v.filters) === now)?.name ?? null;
  }, [visibleIds, sort, stored.filters, stored.views]);

  const query = useMemo<GridQuery>(() => ({ text, filters: stored.filters, sort }), [text, stored.filters, sort]);

  return {
    query,
    columns,
    specs,
    visibleIds,
    setText,
    toggleSort,
    setFilter,
    toggleEnum,
    clearFilter,
    clearAllFilters,
    toggleColumn,
    reset,
    views: stored.views,
    activeView,
    saveView,
    applyView,
    deleteView,
    narrowed: text.trim().length > 0 || stored.filters.length > 0,
  };
}
