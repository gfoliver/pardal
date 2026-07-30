import { describe, expect, it } from "vitest";
import {
  computeStandings,
  deserializeSeason,
  generateFixtures,
  InMemorySeasonStore,
  League,
  serializeSeason,
  statsFromSnapshot,
  tableFromSnapshot,
  toSnapshot,
  validateResults,
  type FixtureResult,
} from "@fut/competition";
import { buildTeam } from "@fut/app-cli";

function fourTeams() {
  return [
    buildTeam({ id: "a", name: "Alpha", shortName: "ALP", rating: 72 }),
    buildTeam({ id: "b", name: "Bravo", shortName: "BRV", rating: 66 }),
    buildTeam({ id: "c", name: "Charlie", shortName: "CHR", rating: 60 }),
    buildTeam({ id: "d", name: "Delta", shortName: "DLT", rating: 54 }),
  ];
}

describe("Fixture generation", () => {
  it("double round-robin: every pair twice, each team plays 2(n-1)", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const fixtures = generateFixtures(ids, { doubleRoundRobin: true });
    expect(fixtures).toHaveLength((ids.length * (ids.length - 1))); // 30
    for (const id of ids) {
      const games = fixtures.filter((f) => f.homeTeamId === id || f.awayTeamId === id);
      expect(games).toHaveLength(2 * (ids.length - 1)); // 10
    }
  });

  it("single round-robin has half as many fixtures", () => {
    const ids = ["a", "b", "c", "d"];
    expect(generateFixtures(ids, { doubleRoundRobin: false })).toHaveLength(6);
  });
});

describe("Standings", () => {
  it("computes points and ordering correctly", () => {
    const results: FixtureResult[] = [
      { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 0 }, // a win
      { round: 1, homeTeamId: "c", awayTeamId: "d", homeScore: 1, awayScore: 1 }, // draw
    ];
    const table = computeStandings(["a", "b", "c", "d"], results);
    expect(table[0]!.teamId).toBe("a");
    expect(table[0]!.points).toBe(3);
    expect(table[0]!.goalDifference).toBe(2);
    const c = table.find((r) => r.teamId === "c")!;
    expect(c.points).toBe(1);
  });

  it("counts a fixture ONCE however many times it is recorded", () => {
    // The multiplayer ingest path legitimately re-records a result (a second
    // attestation, a retry, a correction). Before dedup that silently doubled both
    // teams' points, which is the worst kind of bug: a plausible wrong table.
    const one: FixtureResult = { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 0 };
    const table = computeStandings(["a", "b"], [one, one, one]);
    const a = table.find((r) => r.teamId === "a")!;
    expect(a.played).toBe(1);
    expect(a.points).toBe(3);
    expect(a.goalsFor).toBe(2);
  });

  it("lets a later result supersede an earlier one for the same fixture", () => {
    const first: FixtureResult = { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 5, awayScore: 0 };
    const corrected: FixtureResult = { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 0, awayScore: 1 };
    const table = computeStandings(["a", "b"], [first, corrected]);
    expect(table.find((r) => r.teamId === "a")!.points).toBe(0);
    expect(table.find((r) => r.teamId === "b")!.points).toBe(3);
  });

  it("keeps replays of the same tie apart when they carry their own fixtureId", () => {
    // A knockout replay is the same teams in the same round; without an explicit id
    // the (round, home, away) fallback would collapse the two into one.
    const legs: FixtureResult[] = [
      { fixtureId: "t1-r1", round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 1 },
      { fixtureId: "t1-r2", round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 1 },
    ];
    expect(computeStandings(["a", "b"], legs).find((r) => r.teamId === "a")!.played).toBe(2);
  });

  it("counts only confirmed results by default, and a void counts as nothing at all", () => {
    const results: FixtureResult[] = [
      { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 3, awayScore: 0, status: "confirmed" },
      { round: 2, homeTeamId: "a", awayTeamId: "b", homeScore: 9, awayScore: 0, status: "provisional" },
      { round: 3, homeTeamId: "a", awayTeamId: "b", homeScore: 9, awayScore: 0, status: "void" },
    ];
    const official = computeStandings(["a", "b"], results);
    const a = official.find((r) => r.teamId === "a")!;
    expect(a.played).toBe(1);
    expect(a.goalsFor).toBe(3);

    const soFar = computeStandings(["a", "b"], results, { include: ["confirmed", "provisional"] });
    expect(soFar.find((r) => r.teamId === "a")!.played).toBe(2);

    // A void is absent, NOT a 0-0: it adds no game played and no clean sheet. So b
    // carries only the confirmed 3-0 against it, and the two 9-0s leave no trace.
    const b = official.find((r) => r.teamId === "b")!;
    expect(b.played).toBe(1);
    expect(b.goalsAgainst).toBe(3);
    expect(b.lost).toBe(1);
  });

  it("lets a void supersede the provisional result it repudiates", () => {
    const key = { fixtureId: "f1", round: 1, homeTeamId: "a", awayTeamId: "b" };
    const results: FixtureResult[] = [
      { ...key, homeScore: 4, awayScore: 0, status: "provisional" },
      { ...key, homeScore: 4, awayScore: 0, status: "void" },
    ];
    // Dedup has to run BEFORE the status filter, or the void is dropped first and
    // the result it was meant to cancel survives.
    const table = computeStandings(["a", "b"], results, { include: ["confirmed", "provisional"] });
    expect(table.find((r) => r.teamId === "a")!.played).toBe(0);
  });

  it("treats a result with no status as confirmed, so old saves still add up", () => {
    const legacy: FixtureResult = { round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 0 };
    expect(computeStandings(["a", "b"], [legacy]).find((r) => r.teamId === "a")!.points).toBe(3);
  });
});

describe("validateResults", () => {
  it("reports what computeStandings would silently skip", () => {
    const issues = validateResults(
      ["a", "b"],
      [
        { round: 1, homeTeamId: "a", awayTeamId: "zz", homeScore: 1, awayScore: 0 },
        { round: 2, homeTeamId: "a", awayTeamId: "a", homeScore: 1, awayScore: 0 },
        { round: 3, homeTeamId: "a", awayTeamId: "b", homeScore: -1, awayScore: 0.5 },
        { round: 4, homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 0 },
        { round: 4, homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 0 },
      ],
    );
    const problems = issues.map((i) => i.problem);
    expect(problems).toContain("unknownTeam");
    expect(problems).toContain("sameTeam");
    expect(problems.filter((p) => p === "badScore")).toHaveLength(2); // negative AND fractional
    expect(problems).toContain("duplicate");
  });

  it("says nothing about a clean set of results", () => {
    expect(
      validateResults(["a", "b"], [{ round: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 0 }]),
    ).toEqual([]);
  });
});

describe("League season", () => {
  it("is deterministic for a given seed", () => {
    const a = new League(fourTeams()).simulateSeason(7);
    const b = new League(fourTeams()).simulateSeason(7);
    expect(a.table).toEqual(b.table);
  });

  it("every team plays a full double round-robin", () => {
    const season = new League(fourTeams()).simulateSeason(1);
    for (const row of season.table) {
      expect(row.played).toBe(2 * (4 - 1)); // 6
    }
    // Points conservation: 3 per decisive game, 2 per draw.
    const totalPoints = season.table.reduce((s, r) => s + r.points, 0);
    const draws = season.fixtures.filter((f) => f.homeScore === f.awayScore).length;
    const decisive = season.fixtures.length - draws;
    expect(totalPoints).toBe(decisive * 3 + draws * 2);
  });

  it("serializes and restores a season, recomputing the same table", () => {
    const season = new League(fourTeams()).simulateSeason(3);
    const restored = deserializeSeason(serializeSeason(season));
    expect(tableFromSnapshot(restored)).toEqual(season.table);
  });

  it("persists via a SeasonStore", async () => {
    const season = new League(fourTeams()).simulateSeason(5);
    const store = new InMemorySeasonStore();
    await store.save("season-2026", toSnapshot(season));
    const loaded = await store.load("season-2026");
    expect(loaded).not.toBeNull();
    expect(tableFromSnapshot(loaded!)).toEqual(season.table);
  });
});

describe("Season statistics", () => {
  const season = new League(fourTeams()).simulateSeason(9);
  const totalGoals = season.fixtures.reduce(
    (s, f) => s + f.homeScore + f.awayScore,
    0,
  );

  it("top scorers account for exactly every goal scored", () => {
    const scored = season.stats.topScorers.reduce((s, r) => s + r.goals, 0);
    expect(scored).toBe(totalGoals);
  });

  it("assists never exceed goals", () => {
    const assists = season.stats.topAssisters.reduce((s, r) => s + r.assists, 0);
    expect(assists).toBeLessThanOrEqual(totalGoals);
  });

  it("defensive goals-against match the league table", () => {
    for (const row of season.stats.defensive) {
      const tableRow = season.table.find((t) => t.teamId === row.teamId)!;
      expect(row.goalsAgainst).toBe(tableRow.goalsAgainst);
      expect(row.cleanSheets).toBeLessThanOrEqual(tableRow.played);
    }
  });

  it("form is at most 5 valid results per team", () => {
    for (const f of season.stats.form) {
      expect(f.recent.length).toBeLessThanOrEqual(5);
      for (const r of f.recent) expect(["W", "D", "L"]).toContain(r);
    }
  });

  it("recomputes identical stats from a snapshot and is deterministic", () => {
    expect(statsFromSnapshot(toSnapshot(season))).toEqual(season.stats);
    const again = new League(fourTeams()).simulateSeason(9);
    expect(again.stats).toEqual(season.stats);
  });
});
