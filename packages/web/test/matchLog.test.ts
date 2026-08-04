import { describe, expect, it } from "vitest";
import type { PlayerGameLine } from "@fut/career";
import { matchLogSpecs } from "../src/components/career/MatchLog";
import { runQuery } from "../src/components/data";
import { UI_STRINGS } from "../src/i18n/strings";
import type { Formatter } from "../src/lib/format";

/**
 * The two rules a match log has to get right.
 *
 * A season's games sorted by DATE — not by the printed date, which is the trap — and won/drawn/lost as
 * something you can actually filter for. Both are pure functions of a `FieldSpec`, which is why the spec
 * list is exported and this test needs no DOM.
 */

const t = UI_STRINGS["pt-BR"];
// Only `civil` is reached, and only from a cell this test never renders.
const fmt = { civil: (d: unknown) => String(d) } as unknown as Formatter;
const specs = matchLogSpecs(t, fmt);

const game = (over: Partial<PlayerGameLine>): PlayerGameLine => ({
  date: { year: 2026, month: 7, day: 12 },
  competitionName: "Brasileirão",
  opponentShort: "COR",
  home: true,
  goalsFor: 1,
  goalsAgainst: 0,
  rating: 7,
  goals: 0,
  assists: 0,
  ...over,
});

// July, then August, then no date at all.
const JUL = game({ date: { year: 2026, month: 7, day: 12 }, opponentShort: "COR" });
const AUG = game({ date: { year: 2026, month: 8, day: 8 }, opponentShort: "PAL", home: false, goalsFor: 0, goalsAgainst: 2 });
const SEP = game({ date: { year: 2026, month: 9, day: 3 }, opponentShort: "SAO", goalsFor: 2, goalsAgainst: 2, goals: 1 });
const UNDATED = game({ date: null, opponentShort: "VAS" });

describe("ordering a season", () => {
  it("sorts by date, not by the words the date is printed as", () => {
    // The bug this guards: "08 de ago." sorts before "12 de jul." alphabetically, so a log ordered on
    // the rendered string would put August before July. The packed y/m/d number cannot do that.
    const asc = runQuery([AUG, JUL, SEP], specs, { text: "", filters: [], sort: { field: "date", dir: "asc" } });
    expect(asc.map((g) => g.opponentShort)).toEqual(["COR", "PAL", "SAO"]);

    const desc = runQuery([AUG, JUL, SEP], specs, { text: "", filters: [], sort: { field: "date", dir: "desc" } });
    expect(desc.map((g) => g.opponentShort)).toEqual(["SAO", "PAL", "COR"]);
  });

  it("sinks a game with no date at BOTH ends", () => {
    // An unresolved fixture has no date. It is not the oldest game ever played, so it must not lead the
    // ascending list — it is simply not placeable.
    for (const dir of ["asc", "desc"] as const) {
      const rows = runQuery([JUL, UNDATED, AUG], specs, { text: "", filters: [], sort: { field: "date", dir } });
      expect(rows[rows.length - 1]!.opponentShort).toBe("VAS");
    }
  });
});

describe("asking questions of a season", () => {
  it("filters by won, drawn and lost", () => {
    const only = (v: string) =>
      runQuery([JUL, AUG, SEP], specs, { text: "", filters: [{ kind: "enum", field: "outcome", values: [v] }], sort: null })
        .map((g) => g.opponentShort);
    expect(only("W")).toEqual(["COR"]);
    expect(only("L")).toEqual(["PAL"]);
    expect(only("D")).toEqual(["SAO"]);
  });

  it("filters home from away", () => {
    const away = runQuery([JUL, AUG, SEP], specs, {
      text: "",
      filters: [{ kind: "enum", field: "venue", values: ["away"] }],
      sort: null,
    });
    expect(away.map((g) => g.opponentShort)).toEqual(["PAL"]);
  });

  it("finds the games he scored in", () => {
    const scored = runQuery([JUL, AUG, SEP], specs, {
      text: "",
      filters: [{ kind: "range", field: "goals", min: 1 }],
      sort: null,
    });
    expect(scored.map((g) => g.opponentShort)).toEqual(["SAO"]);
  });

  it("searches the opponent and the competition behind it", () => {
    const byClub = runQuery([JUL, AUG], specs, { text: "pal", filters: [], sort: null });
    expect(byClub.map((g) => g.opponentShort)).toEqual(["PAL"]);
    // The competition is not a visible column by default, and is searchable anyway.
    expect(runQuery([JUL, AUG], specs, { text: "brasileirao", filters: [], sort: null })).toHaveLength(2);
  });

  it("declares which way is better only where it is a fact", () => {
    const by = (id: string) => specs.find((s) => s.id === id)!;
    expect(by("rating").better).toBe("higher");
    expect(by("goals").better).toBe("higher");
    // A date is not better for being later, and a scoreline is not a quantity at all.
    expect(by("date").better).toBeUndefined();
    expect(by("result").better).toBeUndefined();
  });
});
