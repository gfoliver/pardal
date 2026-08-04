// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGridState } from "../src/components/data/useGridState";
import type { FieldSpec } from "../src/components/data/types";

/**
 * What a list remembers, and what it must not.
 *
 * This is the first test in the repo that needs a DOM, and it exists because five interaction bugs
 * reached the user by hand-verification alone. `runQuery` is pure and covered elsewhere; everything
 * here is the STATEFUL half — the three-step sort cycle, the rules about which columns may be hidden,
 * and what survives a reload — which has no other guard.
 */

interface Row {
  id: string;
  name: string;
  age: number;
}

const SPECS: FieldSpec<Row>[] = [
  { id: "name", label: "Name", kind: "text", required: true, value: (r) => r.name },
  { id: "age", label: "Age", kind: "number", value: (r) => r.age },
  { id: "extra", label: "Extra", kind: "number", hiddenByDefault: true, value: (r) => r.age * 2 },
];

const KEY = "onze.grid.test-grid";
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null");
const mount = (specs = SPECS) => renderHook(() => useGridState("test-grid", specs, { field: "age", dir: "desc" }));

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("which columns are on", () => {
  it("starts with the screen's own defaults, hiding what asked to be hidden", () => {
    const { result } = mount();
    expect(result.current.columns.map((c) => c.id)).toEqual(["name", "age"]);
  });

  it("keeps the DECLARED order when a hidden column is switched on", () => {
    // Not the order it was ticked in: a table that rearranges itself while the manager picks columns
    // is a table he has to re-read after every tick.
    const { result } = mount();
    act(() => result.current.toggleColumn("extra"));
    expect(result.current.columns.map((c) => c.id)).toEqual(["name", "age", "extra"]);
  });

  it("will not let go of a required column", () => {
    const { result } = mount();
    act(() => result.current.toggleColumn("name"));
    // `name` identifies the row; hiding it would leave a table of numbers about nobody.
    expect(result.current.columns.map((c) => c.id)).toContain("name");
  });

  it("drops a stored column the screen no longer declares, and restores a required one", () => {
    localStorage.setItem(KEY, JSON.stringify({ visible: ["age", "gone"], sort: null, filters: [] }));
    const { result } = mount();
    // "gone" vanishes rather than leaving a hole; "name" comes back because it is required even
    // though the stored layout did not list it.
    expect(result.current.columns.map((c) => c.id)).toEqual(["name", "age"]);
  });
});

describe("sorting", () => {
  it("cycles descending, ascending, then back to the screen's default", () => {
    const { result } = mount();
    expect(result.current.query.sort).toEqual({ field: "age", dir: "desc" });

    act(() => result.current.toggleSort("name"));
    expect(result.current.query.sort).toEqual({ field: "name", dir: "desc" });
    act(() => result.current.toggleSort("name"));
    expect(result.current.query.sort).toEqual({ field: "name", dir: "asc" });
    // A third ask clears it, which hands the list back to the order the screen chose.
    act(() => result.current.toggleSort("name"));
    expect(result.current.query.sort).toEqual({ field: "age", dir: "desc" });
  });
});

describe("filters", () => {
  it("replaces rather than stacks a second filter on one field", () => {
    const { result } = mount();
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 30 }));
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 25 }));
    expect(result.current.query.filters).toEqual([{ kind: "range", field: "age", max: 25 }]);
  });

  it("reports being narrowed by text or by a filter, and stops when cleared", () => {
    const { result } = mount();
    expect(result.current.narrowed).toBe(false);

    act(() => result.current.setText("silva"));
    expect(result.current.narrowed).toBe(true);
    act(() => result.current.setFilter({ kind: "bool", field: "age", value: true }));

    // One gesture clears both, because a manager staring at an empty list wants it back, not an audit
    // of which of two things emptied it.
    act(() => result.current.clearAllFilters());
    expect(result.current.narrowed).toBe(false);
    expect(result.current.query.text).toBe("");
    expect(result.current.query.filters).toEqual([]);
  });
});

describe("saved views", () => {
  it("snapshots the arrangement under a name, and restores it", () => {
    const { result } = mount();
    act(() => result.current.toggleColumn("extra"));
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    act(() => result.current.saveView("jovens"));

    // Back to nothing, then back to the view.
    act(() => result.current.reset());
    expect(result.current.query.filters).toEqual([]);
    act(() => result.current.applyView("jovens"));
    expect(result.current.query.filters).toEqual([{ kind: "range", field: "age", max: 23 }]);
    expect(result.current.columns.map((c) => c.id)).toEqual(["name", "age", "extra"]);
  });

  it("knows which view is on, and stops claiming it the moment anything changes", () => {
    const { result } = mount();
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    act(() => result.current.saveView("jovens"));
    expect(result.current.activeView).toBe("jovens");

    act(() => result.current.setFilter({ kind: "range", field: "age", max: 30 }));
    // Derived, not a remembered flag — which is why it cannot go on claiming "jovens" here.
    expect(result.current.activeView).toBe(null);
  });

  it("still claims the view when a filter menu is merely open", () => {
    // Adding a filter inserts an idle one before the manager types a bound. That is a menu being
    // open, not a change to the arrangement, and the bar must not flicker back to "Views".
    const { result } = mount();
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    act(() => result.current.saveView("jovens"));
    act(() => result.current.setFilter({ kind: "enum", field: "name", values: [] }));
    expect(result.current.activeView).toBe("jovens");
  });

  it("does not care in which order the filters were set", () => {
    const { result } = mount();
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    act(() => result.current.setFilter({ kind: "bool", field: "extra", value: true }));
    act(() => result.current.saveView("jovens"));

    act(() => result.current.clearAllFilters());
    act(() => result.current.setFilter({ kind: "bool", field: "extra", value: true }));
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    expect(result.current.activeView).toBe("jovens");
  });

  it("overwrites a view of the same name in place, rather than adding a second", () => {
    const { result } = mount();
    act(() => result.current.saveView("a"));
    act(() => result.current.saveView("b"));
    act(() => result.current.setFilter({ kind: "range", field: "age", min: 30 }));
    act(() => result.current.saveView("A")); // same name, different case

    expect(result.current.views.map((v) => v.name)).toEqual(["A", "b"]);
    expect(result.current.views[0]!.filters).toEqual([{ kind: "range", field: "age", min: 30 }]);
  });

  it("refuses a nameless view", () => {
    const { result } = mount();
    act(() => result.current.saveView("   "));
    expect(result.current.views).toEqual([]);
  });

  it("keeps the views when the layout is reset", () => {
    // A reset is about the arrangement. Throwing away the things he typed a NAME for would be
    // destroying data behind a button labelled "restore defaults".
    const { result } = mount();
    act(() => result.current.setFilter({ kind: "range", field: "age", max: 23 }));
    act(() => result.current.saveView("jovens"));
    act(() => result.current.reset());
    expect(result.current.views.map((v) => v.name)).toEqual(["jovens"]);
  });

  it("survives a reload, and drops one stored in a shape it cannot trust", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        visible: null,
        sort: null,
        filters: [],
        views: [
          { name: "boa", visible: ["name", "age"], sort: null, filters: [{ kind: "bool", field: "age", value: true }] },
          // Whole view dropped, not repaired: a view is a promise about what the list shows, and one
          // with its filter quietly removed would keep the name while showing something else.
          { name: "ruim", visible: ["name"], sort: null, filters: [{ kind: "range", field: "age", min: "vinte" }] },
          { name: "", visible: [], sort: null, filters: [] },
        ],
      }),
    );
    const { result } = mount();
    expect(result.current.views.map((v) => v.name)).toEqual(["boa"]);
  });

  it("forgets a deleted view", () => {
    const { result } = mount();
    act(() => result.current.saveView("jovens"));
    act(() => result.current.deleteView("JOVENS"));
    expect(result.current.views).toEqual([]);
  });
});

describe("what survives a reload", () => {
  it("remembers the layout, the sort and the filters", () => {
    const { result } = mount();
    act(() => result.current.toggleColumn("extra"));
    act(() => result.current.toggleSort("name"));
    act(() => result.current.setFilter({ kind: "range", field: "age", min: 18 }));

    expect(stored().visible).toContain("extra");
    expect(stored().sort).toEqual({ field: "name", dir: "desc" });
    expect(stored().filters).toEqual([{ kind: "range", field: "age", min: 18 }]);

    // A fresh mount reads them back.
    const again = mount();
    expect(again.result.current.columns.map((c) => c.id)).toEqual(["name", "age", "extra"]);
    expect(again.result.current.query.sort).toEqual({ field: "name", dir: "desc" });
  });

  it("never remembers the search box", () => {
    // A restored search would hide most of a squad with the explanation two clicks away. A filter
    // chip says out loud what it is doing; a text box you did not type into does not.
    const { result } = mount();
    act(() => result.current.setText("arrascaeta"));
    expect(JSON.stringify(stored())).not.toContain("arrascaeta");
    expect(mount().result.current.query.text).toBe("");
  });

  it("ignores a corrupt layout instead of throwing", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = mount();
    expect(result.current.columns.map((c) => c.id)).toEqual(["name", "age"]);
  });

  it("throws away a stored filter of the wrong shape", () => {
    // Untrusted input: an older build could have written anything, and a filter with a non-numeric
    // bound would silently reject every row.
    localStorage.setItem(
      KEY,
      JSON.stringify({ visible: null, sort: { field: "age", dir: "sideways" }, filters: [{ kind: "range", field: "age", min: "eighteen" }, { kind: "bool", field: "age", value: true }] }),
    );
    const { result } = mount();
    expect(result.current.query.filters).toEqual([{ kind: "bool", field: "age", value: true }]);
    expect(result.current.query.sort).toEqual({ field: "age", dir: "desc" }); // the default, not "sideways"
  });
});
