import { describe, expect, it } from "vitest";
import { CARD_SLOTS, cardFields } from "../src/components/data/cards";
import type { FieldSpec } from "../src/components/data/types";

/** A row is irrelevant here: `cardFields` chooses FIELDS, never looking at a value. */
type Row = { readonly n: number };

const spec = (id: string): FieldSpec<Row> => ({ id, label: id, kind: "number", value: (r) => r.n });

const NAME = spec("name");
const OVR = spec("ovr");
const AGE = spec("age");
const POS = spec("pos");
const WAGE = spec("wage");
const VALUE = spec("value");

const ids = (out: readonly FieldSpec<Row>[]) => out.map((s) => s.id);

describe("cardFields", () => {
  const columns = [NAME, OVR, AGE, POS, WAGE, VALUE];

  it("skips the identity and takes the declared order", () => {
    // The identity is the card's title, so repeating it as a labelled pair would print the name twice.
    expect(ids(cardFields(columns, null))).toEqual(["ovr", "age", "pos"]);
  });

  it("takes exactly CARD_SLOTS fields when nothing is sorted", () => {
    expect(cardFields(columns, null)).toHaveLength(CARD_SLOTS);
  });

  it("appends the sorted field when it falls outside the slots", () => {
    // Ordered the list by wage, so the card has to show the wage — the whole reason he sorted.
    expect(ids(cardFields(columns, { field: "wage", dir: "desc" }))).toEqual(["ovr", "age", "pos", "wage"]);
  });

  it("does not duplicate a sorted field that already fits", () => {
    expect(ids(cardFields(columns, { field: "age", dir: "asc" }))).toEqual(["ovr", "age", "pos"]);
  });

  it("does not re-add the identity when the list is sorted by it", () => {
    // Sorting by name is already visible in the title; a "Name: Rossi" pair under the heading "Rossi"
    // would spend a slot saying it twice.
    expect(ids(cardFields(columns, { field: "name", dir: "asc" }))).toEqual(["ovr", "age", "pos"]);
  });

  it("ignores a sort naming a column that is not visible", () => {
    // A stored sort can name a field a later build removed, or one the manager has since hidden. The
    // card cannot show it, so it must not pretend to — and must not crash reaching for it.
    expect(ids(cardFields([NAME, OVR, AGE], { field: "wage", dir: "desc" }))).toEqual(["ovr", "age"]);
  });

  it("survives a list with fewer fields than slots", () => {
    expect(ids(cardFields([NAME, OVR], null))).toEqual(["ovr"]);
    expect(ids(cardFields([NAME], null))).toEqual([]);
    // A grid with no columns at all is not a real screen, but it must not throw on the way to being one.
    expect(ids(cardFields([], { field: "ovr", dir: "asc" }))).toEqual([]);
  });
});
