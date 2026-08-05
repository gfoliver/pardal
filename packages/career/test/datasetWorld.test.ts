import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mergeSources, runPipeline, type RawSnapshot } from "@fut/dataset";
import { Career, InMemoryDatasetProvider, PROMOTED_PER_SEASON } from "@fut/career";

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dataset/data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

describe("career on an assembled dataset (world integration)", () => {
  const { league, world } = runPipeline(SAMPLE);
  const provider = new InMemoryDatasetProvider("bra", "1", [league], { [league.id]: world });

  it("provider serves the league and its world", () => {
    expect(provider.getLeague(league.id).teams.length).toBe(20);
    expect(provider.getWorld!(league.id)!.competitions.some((c) => c.type === "cup")).toBe(true);
  });

  it("createCareer seeds cups + club metadata from the world", () => {
    const career = Career.create(provider.getLeague(league.id), {
      leagueId: league.id,
      managedClubId: "614", // CR Flamengo (Transfermarkt verein id)
      seed: 1,
      world: provider.getWorld!(league.id)!,
    });
    const snap = career.snapshot();
    // Cup descriptor carried into the structure.
    expect(snap.structure.cups.map((c) => c.id)).toContain("BRC");
    // Club metadata populated from world.json.
    const fla = career.clubDetail("614")!;
    expect(fla.stadium).toContain("Mário Filho"); // Maracanã's official name
    expect(fla.founded).toBe(1895);
    expect(fla.reputation).toBeGreaterThan(80);
  });

  it("plays a deterministic season on the derived dataset", () => {
    const career = Career.create(provider.getLeague(league.id), { leagueId: league.id, managedClubId: "614", seed: 3, world });
    career.simulateSeason();
    const table = career.table("league");
    expect(table).toHaveLength(20);
    expect(table.reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
  });
});

/**
 * The pyramid, on a REAL two-tier artifact rather than a hand-built world.
 *
 * `pyramid.test.ts` proves the division logic against synthetic worlds; this proves the whole chain
 * the user will actually run — one snapshot per competition, merged, through the pipeline, into a
 * career that simulates both divisions and moves clubs between them. Built by splitting the committed
 * Série A sample in two, because Série B has not been scraped yet: the shape is the production shape,
 * only the clubs' names are in the wrong division.
 */
describe("career on a two-tier dataset", () => {
  const ALL = SAMPLE.competitions.find((c) => c.type === "league")!.entrantClubIds;
  const TOP = ALL.slice(0, 10);
  const SECOND = ALL.slice(10);

  const tier = (clubIds: readonly string[], id: string, name: string, tierNo: number): RawSnapshot => {
    const ids = new Set(clubIds);
    return {
      primaryCompetitionId: id,
      competitions: [
        { id, name, type: "league", country: "Brazil", tier: tierNo, seasonId: "2025", format: { twoLegged: false }, entrantClubIds: [...clubIds] },
        { id: "BRC", name: "Copa do Brasil", type: "cup", country: "Brazil", seasonId: "2025", format: { twoLegged: true }, entrantClubIds: [...clubIds] },
      ],
      clubs: SAMPLE.clubs.filter((c) => ids.has(c.id)),
      players: SAMPLE.players.filter((p) => ids.has(p.clubId)),
    };
  };

  const built = () => runPipeline(mergeSources([tier(TOP, "BRA1", "Série A", 1), tier(SECOND, "BRA2", "Série B", 2)]));
  /** Managing a club in the SECOND tier, which is the case every single-league assumption broke. */
  const career = (seed: number) => {
    const { league: l, world: w } = built();
    return Career.create(l, { leagueId: l.id, managedClubId: SECOND[0]!, seed, world: w });
  };

  it("becomes two divisions of the right size", () => {
    const divisions = career(1).snapshot().structure.divisions;
    expect(divisions.map((d) => [d.tier, d.teamIds.length])).toEqual([
      [1, TOP.length],
      [2, SECOND.length],
    ]);
  });

  it("plays a season in both, and the second-tier manager sees his OWN table", () => {
    const c = career(2);
    c.simulateSeason();
    // `table()` with no argument is the manager's division — the top flight would be the old bug.
    const mine = c.table();
    expect(mine.map((r) => r.teamId).sort()).toEqual([...SECOND].sort());
    expect(mine.reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
    expect(c.table("league").reduce((s, r) => s + r.played, 0)).toBeGreaterThan(0);
  });

  it("moves clubs between the two at the rollover", () => {
    const c = career(3);
    c.simulateSeason();
    const promoted = c.table("league-d2").slice(0, PROMOTED_PER_SEASON).map((r) => r.teamId);
    c.rolloverSeason();
    const top = c.snapshot().structure.divisions.find((d) => d.tier === 1)!;
    for (const id of promoted) expect(top.teamIds).toContain(id);
    expect(top.teamIds).toHaveLength(TOP.length);
  });

  it("gives the Copa do Brasil both divisions' entrants", () => {
    // The merge defect, seen from the career: the cup used to arrive with only one tier's field.
    const cup = career(4).snapshot().structure.cups.find((c) => c.id === "BRC");
    expect(cup?.entrantTeamIds).toHaveLength(ALL.length);
  });
});
