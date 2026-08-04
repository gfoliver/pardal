// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usefulSpecs, winners } from "../src/components/data/compare";
import { useSelection } from "../src/components/data/useSelection";
import type { FieldSpec } from "../src/components/data/types";

/**
 * Picking a few rows out of a list, and laying them side by side.
 *
 * The two halves are tested apart because they fail apart: the selection is stateful and capped, while
 * "who wins this row" is arithmetic over a `FieldSpec` and the one place the table could assert
 * something it does not know.
 */

interface P {
  id: string;
  name: string;
  age: number;
  pace: number | undefined;
  wage: number;
  injured: boolean;
  cover: string;
}

const A: P = { id: "a", name: "Rossi", age: 30, pace: 70, wage: 100, injured: false, cover: "" };
const B: P = { id: "b", name: "Pereira", age: 24, pace: 82, wage: 250, injured: false, cover: "" };
const C: P = { id: "c", name: "Varela", age: 27, pace: undefined, wage: 250, injured: true, cover: "MC" };

const SPECS: FieldSpec<P>[] = [
  { id: "name", label: "Name", kind: "text", required: true, value: (r) => r.name },
  { id: "age", label: "Age", kind: "number", value: (r) => r.age }, // no direction: 24 is not "better"
  { id: "pace", label: "Pace", kind: "number", better: "higher", value: (r) => r.pace },
  { id: "wage", label: "Wage", kind: "money", better: "lower", value: (r) => r.wage },
  { id: "injured", label: "Injured", kind: "bool", value: (r) => r.injured },
  { id: "cover", label: "Also plays", kind: "text", value: (r) => r.cover },
  { id: "actions", label: "", kind: "text", required: true, value: () => undefined },
];

const specOf = (id: string) => SPECS.find((s) => s.id === id)!;

describe("which fields get a row", () => {
  it("drops the identity field and anything nobody has a value for", () => {
    // `name` is the column HEADING; repeating it as a row would spend the width twice. `actions` is a
    // control with no value at all.
    expect(usefulSpecs(SPECS, [A, B]).map((s) => s.id)).toEqual(["age", "pace", "wage"]);
  });

  it("keeps a field only one of them has", () => {
    // Pace unknown for Varela is exactly the comparison a manager wants to see — one number and one
    // gap is information, and hiding the row would hide the gap.
    expect(usefulSpecs(SPECS, [C, B]).map((s) => s.id)).toContain("pace");
  });

  it("drops a field none of them has", () => {
    expect(usefulSpecs(SPECS, [C]).map((s) => s.id)).not.toContain("pace");
  });

  it("drops a row that would be all em dashes, no and nothing included", () => {
    // "Neither of them is injured" and "neither plays anywhere else" are not comparisons — they are
    // two dashes side by side. `false` and `""` print exactly like unknown, so they count as blank.
    expect(usefulSpecs(SPECS, [A, B]).map((s) => s.id)).not.toContain("injured");
    expect(usefulSpecs(SPECS, [A, B]).map((s) => s.id)).not.toContain("cover");
  });

  it("keeps them the moment one of them does have something to say", () => {
    const ids = usefulSpecs(SPECS, [A, C]).map((s) => s.id);
    expect(ids).toContain("injured");
    expect(ids).toContain("cover");
  });
});

describe("who wins a row", () => {
  it("marks the highest where higher is better, and the lowest where lower is", () => {
    expect([...winners(specOf("pace"), [A, B])]).toEqual([1]);
    expect([...winners(specOf("wage"), [A, B])]).toEqual([0]);
  });

  it("marks nothing where the field did not say which way is better", () => {
    // A 24-year-old is not a better player than a 30-year-old, and the table must not imply it.
    expect(winners(specOf("age"), [A, B]).size).toBe(0);
  });

  it("marks every one of a tie", () => {
    expect([...winners(specOf("wage"), [B, C])]).toEqual([0, 1]);
  });

  it("never lets an unknown win, and does not let it stop the others", () => {
    // A player nobody has watched has not got the best pace in the room — but the two who have been
    // watched still settle the row between them.
    expect([...winners(specOf("pace"), [A, B, C])]).toEqual([1]);
  });

  it("marks nothing when only one value is known", () => {
    // Rossi is not faster than a player nobody has scouted; he is faster than nobody we can name.
    // Marking him would be the table asserting the very thing the fog is there to withhold.
    expect(winners(specOf("pace"), [A, C]).size).toBe(0);
  });
});

describe("picking rows", () => {
  it("keeps them in the order they were picked", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("c"));
    act(() => result.current.toggle("a"));
    // Pick order, not row order: the comparison columns must not rearrange as he adds one.
    expect(result.current.ids).toEqual(["c", "a"]);
  });

  it("unticks", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("a"));
    expect(result.current.ids).toEqual([]);
    expect(result.current.has("a")).toBe(false);
  });

  it("stops at the cap without evicting an earlier pick", () => {
    // He ticked those on purpose. A pick that quietly drops the oldest is one he has to audit — the
    // grid disables the remaining ticks instead.
    const { result } = renderHook(() => useSelection(2));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.full).toBe(true);
    act(() => result.current.toggle("c"));
    expect(result.current.ids).toEqual(["a", "b"]);
  });

  it("takes another once one is let go", () => {
    const { result } = renderHook(() => useSelection(2));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c"));
    expect(result.current.ids).toEqual(["b", "c"]);
    expect(result.current.full).toBe(true);
  });

  it("clears", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
    expect(result.current.full).toBe(false);
  });
});
