import type { ReactNode } from "react";
import type { FieldSpec, FieldValue } from "./types";

/**
 * How a field is drawn when it has not said otherwise.
 *
 * Its own module because all three presentations of a list need it — the table, the cards, and the
 * side-by-side — and having them reach into each other for it is how an import cycle starts.
 */

/** The value, or an em dash for the three things that mean "nothing to say". */
export function defaultCell(v: FieldValue): ReactNode {
  if (v === undefined || v === "") return <span className="text-fg-faint">—</span>;
  if (typeof v === "boolean") return v ? "✓" : <span className="text-fg-faint">—</span>;
  return String(v);
}

export const alignClass = (a: FieldSpec<unknown>["align"]) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

/**
 * Makes a cell's declared alignment survive the control inside it.
 *
 * A `<button>` has `text-align: center` from the user agent, and it beats the alignment inherited from
 * the cell. So the league table's club column — a `<td>` correctly set to `text-left`, holding a
 * full-width button that links to the club — drew every short name floating in the middle of its cell,
 * which is what the manager reported. `Bahia` measured `text-align: center` under a `text-align: left`
 * cell.
 *
 * Applied by the renderers rather than by each screen, because the alternative is what the code was
 * already doing: two screens had discovered the problem and pasted `text-left` into their own cells,
 * which fixes those cells and leaves the next one to find it again.
 */
export const INHERIT_ALIGN = "[&_button]:[text-align:inherit]";
