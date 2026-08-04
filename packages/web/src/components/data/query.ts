import type { FieldSpec, FieldValue, Filter, GridQuery, Sort } from "./types";

/**
 * Applying what the manager asked for. Pure, so it can be tested without a browser.
 *
 * All of the searching, filtering and ordering in the app funnels through here. It is deliberately
 * dumb about WHAT the fields mean — that lives in each screen's `FieldSpec` list — and careful about
 * one thing only: an unknown value is unknown. A player nobody has scouted has no rating, and the
 * temptation to treat that as zero would put him at the bottom of every list and inside every
 * "rating under 60" filter, which is a lie about a player we simply have not watched.
 */

/**
 * Fold accents away so a Brazilian squad is searchable from an ASCII keyboard.
 *
 * Not optional politeness: this dataset is full of `João`, `Éverton` and `Muñoz`, and a manager
 * typing "joao" is doing the normal thing. NFD splits a letter from its accent, and the property
 * escape then drops the accent.
 */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Everything about a row that free text should match, folded and joined. */
export function searchText<T>(row: T, specs: readonly FieldSpec<T>[]): string {
  const parts: string[] = [];
  for (const spec of specs) {
    // Hidden columns are searched too. Whether a field is on screen is a layout choice; whether it
    // describes the player is not, and being unable to find a Colombian because the nationality
    // column happens to be off would be indefensible.
    const v = spec.value(row);
    if (v !== undefined && typeof v !== "boolean") parts.push(String(v));
    const extra = spec.search?.(row);
    if (extra) parts.push(extra);
  }
  return fold(parts.join(" "));
}

/**
 * Does the row survive one filter?
 *
 * A filter naming a field that does not exist passes rather than rejects: a stored layout can
 * outlive the field it mentions, and silently emptying the manager's squad list is a worse answer
 * than ignoring a filter he can see and remove.
 */
function passes<T>(row: T, spec: FieldSpec<T> | undefined, filter: Filter): boolean {
  if (!spec) return true;
  const v = spec.value(row);

  switch (filter.kind) {
    case "range": {
      if (typeof v !== "number") return false; // unknown is not in any range
      if (filter.min !== undefined && v < filter.min) return false;
      if (filter.max !== undefined && v > filter.max) return false;
      return true;
    }
    case "enum":
      // Nothing selected is not "nothing matches" — it is a filter the manager has opened and not
      // yet used, and it must not blank the list while he decides.
      if (filter.values.length === 0) return true;
      return typeof v === "string" && filter.values.includes(v);
    case "bool":
      return Boolean(v) === filter.value;
  }
}

/** A filter that constrains nothing, and so should not be shown as an active chip. */
export function isIdle(filter: Filter): boolean {
  if (filter.kind === "range") return filter.min === undefined && filter.max === undefined;
  if (filter.kind === "enum") return filter.values.length === 0;
  return false;
}

/**
 * Compare two values of one field.
 *
 * Unknown sinks in BOTH directions. Sorting ascending by rating should not open with everyone we
 * have never watched — they are not the worst players, they are the unmeasured ones, and they belong
 * out of the way whichever end the manager is looking at.
 */
function compare(a: FieldValue, b: FieldValue): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(b) - Number(a);
  // Locale-aware, because this ordering is read by a person. (The simulation's own tie-breaks use
  // codepoint order for portability — see `byCodepoint` — but nothing here feeds a result.)
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

/** Order rows by a sort, unknown last, with a stable fallback so equal rows do not shuffle. */
export function sortRows<T>(rows: readonly T[], specs: readonly FieldSpec<T>[], sort: Sort | null): readonly T[] {
  if (!sort) return rows;
  const spec = specs.find((s) => s.id === sort.field);
  if (!spec) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  // Index-keyed rather than sorting in place: `rows` comes straight from the career and re-sorting
  // the array we were handed would reorder the caller's data behind its back. The index also makes
  // the sort stable, so a column of equal values keeps the order underneath it.
  return rows
    .map((row, i) => ({ row, i, v: spec.value(row) }))
    .sort((x, y) => {
      const c = compare(x.v, y.v);
      // The unknowns settled their own order in `compare`; the direction must not flip them back up.
      if (x.v === undefined || y.v === undefined) return c || x.i - y.i;
      return c * sign || x.i - y.i;
    })
    .map((e) => e.row);
}

/** Search, filter and sort in one pass over the query. */
export function runQuery<T>(rows: readonly T[], specs: readonly FieldSpec<T>[], query: GridQuery): readonly T[] {
  const byId = new Map(specs.map((s) => [s.id, s]));
  const active = query.filters.filter((f) => !isIdle(f));
  // Every whitespace-separated word must appear SOMEWHERE in the row, in any field and any order —
  // so "joao zag" finds the centre-back and "flamengo 25" the twenty-five-year-olds at Flamengo.
  const terms = fold(query.text.trim()).split(/\s+/).filter(Boolean);

  let out = rows;
  if (active.length > 0) out = out.filter((row) => active.every((f) => passes(row, byId.get(f.field), f)));
  if (terms.length > 0) {
    out = out.filter((row) => {
      const hay = searchText(row, specs);
      return terms.every((t) => hay.includes(t));
    });
  }
  return sortRows(out, specs, query.sort);
}

/** The span a range widget should offer for a field: what the data actually contains. */
export function extentOf<T>(rows: readonly T[], spec: FieldSpec<T>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const v = spec.value(row);
    if (typeof v !== "number") continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : null;
}
