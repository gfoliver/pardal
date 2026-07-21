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
