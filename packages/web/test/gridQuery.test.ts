import { describe, expect, it } from "vitest";
import { extentOf, fold, runQuery, searchText, sortRows } from "../src/components/data/query";
import type { FieldSpec, GridQuery } from "../src/components/data/types";

/**
 * The rules every list in the app obeys.
 *
 * Two of them are the reason this is tested rather than eyeballed.
 *
 * UNKNOWN IS NOT ZERO. A player nobody has scouted has no rating, and the cheap thing to do is call
 * that 0 — which would drop him to the bottom of every list and, worse, sweep him into every "rating
 * under 60" filter. He is not a bad player; he is an unmeasured one, and a filter that claims
 * otherwise is a filter that lies.
 *
 * ACCENTS DO NOT BLOCK SEARCH. This dataset is João, Éverton and Muñoz. A manager typing "joao" is
 * doing the normal thing and must find his man.
 */

interface Row {
  id: string;
  name: string;
  club: string;
  pos: string;
  age: number;
  /** Absent for a player nobody has watched. */
  rating?: number;
  injured: boolean;
}

const SPECS: FieldSpec<Row>[] = [
  { id: "name", label: "Name", kind: "text", value: (r) => r.name, required: true },
  { id: "club", label: "Club", kind: "text", value: (r) => r.club, search: (r) => (r.club === "FLA" ? "Flamengo" : "") },
  { id: "pos", label: "Pos", kind: "enum", value: (r) => r.pos },
  { id: "age", label: "Age", kind: "number", value: (r) => r.age },
  { id: "rating", label: "Ovr", kind: "number", value: (r) => r.rating },
  { id: "injured", label: "Inj", kind: "bool", value: (r) => r.injured },
];

const ROWS: Row[] = [
  { id: "a", name: "João Silva", club: "FLA", pos: "ZAG", age: 24, rating: 78, injured: false },
  { id: "b", name: "Éverton Souza", club: "PAL", pos: "ATA", age: 31, rating: 84, injured: true },
  { id: "c", name: "Muñoz", club: "COR", pos: "MEI", age: 19, rating: 66, injured: false },
  // Never scouted: no rating at all.
  { id: "d", name: "Pedro Alves", club: "SAN", pos: "ZAG", age: 27, injured: false },
  { id: "e", name: "Carlos Lima", club: "FLA", pos: "ATA", age: 22, rating: 71, injured: false },
];

const q = (over: Partial<GridQuery> = {}): GridQuery => ({ text: "", filters: [], sort: null, ...over });
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

describe("free-text search", () => {
  it("finds an accented name from an unaccented keyboard", () => {
    expect(ids(runQuery(ROWS, SPECS, q({ text: "joao" })))).toEqual(["a"]);
    expect(ids(runQuery(ROWS, SPECS, q({ text: "everton" })))).toEqual(["b"]);
    expect(ids(runQuery(ROWS, SPECS, q({ text: "munoz" })))).toEqual(["c"]);
    expect(fold("José Ángel Muñíz")).toBe("jose angel muniz");
  });

  it("matches every word, in any field and any order", () => {
    // "flamengo" only exists in the club's `search` text; "22" only in the age column.
    expect(ids(runQuery(ROWS, SPECS, q({ text: "flamengo 22" })))).toEqual(["e"]);
    expect(ids(runQuery(ROWS, SPECS, q({ text: "22 flamengo" })))).toEqual(["e"]);
  });

  it("searches columns that are switched off", () => {
    // `searchText` is given every declared spec, not the visible ones: whether the nationality column
    // is on screen is a layout choice, and being unable to find a Colombian because of it is not.
    expect(searchText(ROWS[0]!, SPECS)).toContain("zag");
    expect(ids(runQuery(ROWS, SPECS, q({ text: "zag" })))).toEqual(["a", "d"]);
  });

  it("finds nothing rather than everything when nothing matches", () => {
    expect(runQuery(ROWS, SPECS, q({ text: "goleiro" }))).toHaveLength(0);
  });
});

describe("range filters", () => {
  it("treats both bounds as inclusive", () => {
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "age", min: 22, max: 24 }] })))).toEqual(["a", "e"]);
  });

  it("takes one bound on its own", () => {
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "age", max: 22 }] })))).toEqual(["c", "e"]);
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "age", min: 27 }] })))).toEqual(["b", "d"]);
  });

  it("never sweeps an unknown value into a range", () => {
    // Pedro has no rating. A filter for weak players must not claim him, and neither must one for
    // strong players — he is absent from both, because we have not watched him.
    const weak = runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "rating", max: 70 }] }));
    const strong = runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "rating", min: 70 }] }));
    expect(ids(weak)).toEqual(["c"]);
    expect(ids(strong)).toEqual(["a", "b", "e"]);
    expect([...ids(weak), ...ids(strong)]).not.toContain("d");
  });

  it("ignores a range with neither bound set", () => {
    // The state a filter is in the instant it is added, before anything is typed. It must not blank
    // the list while the manager is still deciding.
    expect(runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "age" }] }))).toHaveLength(ROWS.length);
  });
});

describe("enum and boolean filters", () => {
  it("passes any of the selected values", () => {
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "enum", field: "pos", values: ["ZAG", "MEI"] }] })))).toEqual(["a", "c", "d"]);
  });

  it("does not constrain when nothing is selected yet", () => {
    expect(runQuery(ROWS, SPECS, q({ filters: [{ kind: "enum", field: "pos", values: [] }] }))).toHaveLength(ROWS.length);
  });

  it("filters on a flag in both directions", () => {
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "bool", field: "injured", value: true }] })))).toEqual(["b"]);
    expect(ids(runQuery(ROWS, SPECS, q({ filters: [{ kind: "bool", field: "injured", value: false }] })))).toEqual(["a", "c", "d", "e"]);
  });
});

describe("combining", () => {
  it("requires every filter to pass, alongside the search", () => {
    const out = runQuery(
      ROWS,
      SPECS,
      q({
        text: "flamengo",
        filters: [
          { kind: "enum", field: "pos", values: ["ATA"] },
          { kind: "range", field: "age", max: 25 },
          { kind: "bool", field: "injured", value: false },
        ],
      }),
    );
    expect(ids(out)).toEqual(["e"]);
  });

  it("ignores a filter naming a field that no longer exists", () => {
    // A layout stored by an older build can outlive its fields. Emptying the manager's squad list is
    // a worse answer than skipping a filter he can see and remove.
    expect(runQuery(ROWS, SPECS, q({ filters: [{ kind: "range", field: "gone", min: 5 }] }))).toHaveLength(ROWS.length);
  });
});

describe("sorting", () => {
  it("orders numbers both ways", () => {
    expect(ids(sortRows(ROWS, SPECS, { field: "age", dir: "asc" }))).toEqual(["c", "e", "a", "d", "b"]);
    expect(ids(sortRows(ROWS, SPECS, { field: "age", dir: "desc" }))).toEqual(["b", "d", "a", "e", "c"]);
  });

  it("sinks unknown values in BOTH directions", () => {
    // Ascending by rating should not open with the player nobody has watched. He is not the worst;
    // he is unmeasured, and he belongs out of the way at whichever end is being read.
    expect(ids(sortRows(ROWS, SPECS, { field: "rating", dir: "asc" }))).toEqual(["c", "e", "a", "b", "d"]);
    expect(ids(sortRows(ROWS, SPECS, { field: "rating", dir: "desc" }))).toEqual(["b", "a", "e", "c", "d"]);
  });

  it("orders names ignoring accents, so À sits with A", () => {
    expect(ids(sortRows(ROWS, SPECS, { field: "name", dir: "asc" }))).toEqual(["e", "b", "a", "c", "d"]);
  });

  it("is stable, and leaves the caller's array alone", () => {
    const before = ids(ROWS);
    const sorted = sortRows(ROWS, SPECS, { field: "pos", dir: "asc" });
    expect(ids(ROWS), "the array we were handed must not be reordered").toEqual(before);
    // Two centre-backs, in the order they arrived.
    expect(ids(sorted).filter((id) => id === "a" || id === "d")).toEqual(["a", "d"]);
  });
});

describe("extent", () => {
  it("spans only the values that exist", () => {
    expect(extentOf(ROWS, SPECS.find((s) => s.id === "age")!)).toEqual({ min: 19, max: 31 });
    // Pedro's missing rating neither widens the span to 0 nor breaks it.
    expect(extentOf(ROWS, SPECS.find((s) => s.id === "rating")!)).toEqual({ min: 66, max: 84 });
  });

  it("is null when there is nothing numeric to span", () => {
    expect(extentOf(ROWS, SPECS.find((s) => s.id === "name")!)).toBeNull();
    expect(extentOf([], SPECS.find((s) => s.id === "age")!)).toBeNull();
  });
});
