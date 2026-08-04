import type { ReactNode } from "react";

/**
 * One thing you can look at, sort by, and filter on.
 *
 * The registry every data screen is built from. A screen declares its fields once and the grid,
 * the filter bar and the column picker all read the same declaration — so a column cannot be
 * sortable but unfilterable, or filterable under a label different from its header.
 *
 * The split between `value` and `cell` is the important one. `value` is what the machine compares:
 * a number, a string, a boolean, or `undefined` for genuinely unknown. `cell` is what the manager
 * reads, which is usually formatted and sometimes not a number at all (a crest, a tier-coloured
 * badge, a contract as "2a 4m"). Deriving one from the other in either direction would mean either
 * sorting on formatted strings — where "R$ 9M" comes after "R$ 10M" — or showing raw pennies.
 */
export type FieldValue = number | string | boolean | undefined;

export type FieldKind =
  /** Free text. Searchable, sortable, no range. */
  | "text"
  /** A plain quantity: age, rating, an attribute. Range-filterable. */
  | "number"
  /** A quantity in the save's currency. Range-filterable, and the widget knows to think in millions. */
  | "money"
  /** A span in days — a contract, a listing. Range-filterable in the season-years the manager reads. */
  | "days"
  /** A closed set: position, nationality, squad status. Multi-select. */
  | "enum"
  /** Yes or no: injured, listed, shortlisted. */
  | "bool";

export interface FieldSpec<T> {
  /** Stable — it is the key in stored layouts, so renaming one resets the manager's columns. */
  readonly id: string;
  /** Column header, already translated by the screen that declared it. */
  readonly label: string;
  /** Longer name for the filter menu and the column picker, when the header is an abbreviation. */
  readonly longLabel?: string;
  readonly kind: FieldKind;
  /**
   * The comparable value. `undefined` means UNKNOWN, and unknown is never coerced: it fails every
   * range test and sorts to the bottom in both directions. An unscouted rating is not a zero.
   */
  value(row: T): FieldValue;
  /** What the cell shows. Defaults to the value, printed as-is. */
  cell?(row: T): ReactNode;
  /**
   * Extra words free-text search should match — a club's full name behind its abbreviation, a
   * position's Portuguese label behind its enum key. Searched in addition to `value`, never instead.
   */
  search?(row: T): string;
  /** `enum` only: the options, in the order they should be offered. */
  options?(rows: readonly T[]): readonly EnumOption[];
  /** Hidden until the manager asks for it. The default layout is the readable one, not every field. */
  readonly hiddenByDefault?: boolean;
  /** Always on: the column that identifies the row, which nothing may hide. */
  readonly required?: boolean;
  /**
   * Which way is better, where that is a fact and not an opinion.
   *
   * Only read by the side-by-side comparison, to mark the winner of each row. Left undeclared where
   * the answer depends on the question: a 34-year-old is not worse than a 21-year-old, and a high
   * market value is an asset in your own squad and a bill in someone else's. Marking those would be
   * the table asserting something it cannot know.
   */
  readonly better?: "higher" | "lower";
  readonly align?: "left" | "center" | "right";
  /** Column width in px. The grid is a fixed-layout table so the header cannot drift from the body. */
  readonly width?: number;
  /**
   * `days` only: how many days the manager's "year" is, so a range can be typed in years.
   *
   * No default, and that is the point. A season is `state.totalDays` — 280 in the Brasileirão — not
   * 365, and quietly assuming the Gregorian year here would put "contract under 1 year" 85 days off.
   * Declared by the screen, which is the layer that has the career to ask. Absent, the filter works
   * in plain days and says so rather than converting on a guess.
   */
  readonly perYear?: number;
}

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

/** A filter the manager has actually set. Any number of them combine, and they all have to pass. */
export type Filter =
  /** `min`/`max` are inclusive; either may be absent, which is how "under 23" is expressed. */
  | { readonly kind: "range"; readonly field: string; readonly min?: number; readonly max?: number }
  /** Passes if the row's value is any of these. Empty means the filter is not constraining anything. */
  | { readonly kind: "enum"; readonly field: string; readonly values: readonly string[] }
  | { readonly kind: "bool"; readonly field: string; readonly value: boolean };

export interface Sort {
  readonly field: string;
  readonly dir: "asc" | "desc";
}

/** Everything the manager has asked of a list. Serialisable, because it is remembered per screen. */
export interface GridQuery {
  /** Free text, matched against every field at once. Not persisted — a stale search box lies. */
  readonly text: string;
  readonly filters: readonly Filter[];
  readonly sort: Sort | null;
}

export const EMPTY_QUERY: GridQuery = { text: "", filters: [], sort: null };

/**
 * An arrangement of a list, named and kept.
 *
 * Six stacked filters are how a real question gets asked — "under 23, over 75, contract running out,
 * asking under 12 million" — and rebuilding that from six menus every session is the difference
 * between a tool and a chore. A view is that arrangement with a name on it.
 *
 * Holds the columns, the order and the filters, and deliberately not the search box: a view called
 * "jovens baratos" should mean its filters, not whatever text happened to be typed when it was saved.
 *
 * `name` IS the identity. Saving over a name replaces it — what "save" has meant to everyone who has
 * ever used a file — which also means no generated id nobody ever sees.
 */
export interface SavedView {
  readonly name: string;
  /** The columns, listed explicitly. A view is a snapshot, not a reference to the screen's defaults. */
  readonly visible: readonly string[];
  readonly sort: Sort | null;
  readonly filters: readonly Filter[];
}
