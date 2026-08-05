import type { FieldSpec, Sort } from "./types";

/**
 * Which fields a card shows, kept away from the rendering so it can be tested without a browser.
 *
 * A card is not a narrow table — it is a summary, and a summary that lists every visible column is
 * just the table with the columns stacked, which is worse than either. So the card gets a FIXED,
 * SMALL number of slots.
 *
 * Fixed is the important word. The stated objection to cards is that you cannot scan one number down a
 * list, and it is a real objection — but it only holds if each card decides its own fields. Give every
 * card the same slots in the same order and the third value down is the same field on every card, so
 * the column is scannable again, in a layout that fits a phone.
 */

/** How many fields sit beside the identity. Four pairs is what fits a 360px card without wrapping. */
export const CARD_SLOTS = 3;

/**
 * The fields a card shows, in order, excluding the identity (drawn as the card's title).
 *
 * The first `CARD_SLOTS` visible columns by the screen's own declared order — which is already curated,
 * since every screen puts rating, age and position before release clauses. Plus the field being sorted
 * on, appended when it would otherwise fall outside: a manager who has just ordered the list by wage is
 * asking about wages, and a card that answers by showing him age would be answering a question nobody
 * asked. That is the one case where the slot count goes to four.
 */
export function cardFields<T>(
  columns: readonly FieldSpec<T>[],
  sort: Sort | null,
  slots = CARD_SLOTS,
): readonly FieldSpec<T>[] {
  const picked = columns.slice(1, 1 + slots);
  if (!sort) return picked;
  // Never the identity: it is the title, so sorting by name is already visible in the title.
  const sorted = columns.slice(1).find((s) => s.id === sort.field);
  if (!sorted || picked.includes(sorted)) return picked;
  return [...picked, sorted];
}
