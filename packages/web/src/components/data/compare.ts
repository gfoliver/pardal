import type { FieldSpec } from "./types";

/**
 * The two decisions a side-by-side has to make, kept away from the rendering so they can be tested
 * without a browser: which fields are worth a row, and which cells win one.
 */

/**
 * The values that print as an em dash: unknown, no, and nothing.
 *
 * The same three the grid renders as a dash, which is the point — a field where every picked row is
 * blank is a row of dashes, and a row of dashes is width spent saying nothing. "Neither of them is
 * injured" is not a comparison.
 */
const blank = (v: unknown) => v === undefined || v === false || v === "";

/** Fields worth a row: anything at least one of the picked rows has something to say about. */
export function usefulSpecs<T>(specs: readonly FieldSpec<T>[], rows: readonly T[]): readonly FieldSpec<T>[] {
  // The first field is the row's identity by the kit's own contract, and the heading already draws it:
  // a "Player: Rossi" row under a column headed "Rossi" is width spent twice.
  //
  // The filter then drops the actions column (a control, so no value) along with the blank rows.
  return specs.slice(1).filter((s) => rows.some((r) => !blank(s.value(r))));
}

/**
 * Which cells win their row, by index, where the field declared which way is better.
 *
 * Ties are all marked, because two players equal on pace are equal on pace. Unknowns never win: a
 * player nobody has scouted has not got the best finishing in the room — and a single known value wins
 * nothing either, since there is no one to have beaten.
 */
export function winners<T>(spec: FieldSpec<T>, rows: readonly T[]): ReadonlySet<number> {
  const out = new Set<number>();
  if (!spec.better) return out;
  const nums = rows.map((r) => spec.value(r)).map((v) => (typeof v === "number" ? v : undefined));
  const known = nums.filter((v): v is number => v !== undefined);
  if (known.length < 2) return out;
  const best = spec.better === "higher" ? Math.max(...known) : Math.min(...known);
  nums.forEach((v, i) => {
    if (v === best) out.add(i);
  });
  return out;
}
