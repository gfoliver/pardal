import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadLeagueTeams } from "@fut/competition";
import { mergeSources, runPipeline, type RawSnapshot } from "@fut/dataset";

/**
 * Two scrapes becoming one two-tier dataset.
 *
 * Built by SPLITTING the committed Série A sample rather than inventing squads: ten real clubs stay
 * in the top flight and ten become a second division. That exercises the production path — one
 * snapshot per competition, merged — with real players, months before Série B has actually been
 * scraped, and it is the only reason the pyramid code below could be trusted at all before then.
 */

const SAMPLE: RawSnapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/brasileirao-serie-a/raw.json", import.meta.url)), "utf8"),
);

const CUP = "BRC";

/** One competition's snapshot, exactly as a single `scrapeTransfermarkt` run writes it. */
function tier(clubIds: readonly string[], id: string, name: string, tierNo: number): RawSnapshot {
  const ids = new Set(clubIds);
  return {
    primaryCompetitionId: id,
    competitions: [
      { id, name, type: "league", country: "Brazil", tier: tierNo, seasonId: "2025", format: { twoLegged: false }, entrantClubIds: [...clubIds] },
      // Both divisions enter the same domestic cup — the overlap that broke the merge.
      { id: CUP, name: "Copa do Brasil", type: "cup", country: "Brazil", seasonId: "2025", format: { twoLegged: true }, entrantClubIds: [...clubIds] },
    ],
    clubs: SAMPLE.clubs.filter((c) => ids.has(c.id)),
    players: SAMPLE.players.filter((p) => ids.has(p.clubId)),
  };
}

const ALL = SAMPLE.competitions.find((c) => c.type === "league")!.entrantClubIds;
const TOP = ALL.slice(0, 10);
const SECOND = ALL.slice(10);
const merged = () => mergeSources([tier(TOP, "BRA1", "Série A", 1), tier(SECOND, "BRA2", "Série B", 2)]);

describe("merging two divisions into one snapshot", () => {
  it("unions the shared cup's entrants instead of overwriting them", () => {
    /*
     * The defect. `mergeSources` overlaid competitions by id, so the second division's Copa do Brasil
     * replaced the first's and the cup went into the artifact with half its field — no error, just a
     * cup that had quietly forgotten twenty clubs.
     */
    const cup = merged().competitions.find((c) => c.id === CUP)!;
    expect(cup.entrantClubIds).toHaveLength(ALL.length);
    expect([...cup.entrantClubIds].sort()).toEqual([...ALL].sort());
  });

  it("keeps both leagues, with their tiers", () => {
    const leagues = merged().competitions.filter((c) => c.type === "league");
    expect(leagues.map((c) => [c.id, c.tier])).toEqual([
      ["BRA1", 1],
      ["BRA2", 2],
    ]);
  });

  /**
   * The player on both squad pages. Four of the real 1305 are, and the club they ended up at was
   * decided by which snapshot came second on the command line.
   *
   * Asserted in BOTH directions from the same fixture, because a rule that only ever picks the top
   * flight would pass a one-sided test and is wrong on the real data (Sergio Palacios played his
   * minutes in Série B).
   */
  it("places a player listed in both divisions at the club that played him", () => {
    const a = SAMPLE.players.find((p) => TOP.includes(p.clubId))!;
    const withMinutes = (p: typeof a, clubId: string, minutes: number) => ({
      ...p,
      clubId,
      stats: [{ source: "transfermarkt" as const, competitionId: "X", seasonId: "2025", appearances: 1, minutes, goals: 0, assists: 0, yellow: 0, red: 0 }],
    });
    const secondClub = SECOND[0]!;

    const stays = mergeSources([
      { players: [withMinutes(a, a.clubId, 2000)] },
      { players: [withMinutes(a, secondClub, 0)] },
    ]);
    expect(stays.players[0]!.clubId).toBe(a.clubId);

    const moves = mergeSources([
      { players: [withMinutes(a, a.clubId, 0)] },
      { players: [withMinutes(a, secondClub, 720)] },
    ]);
    expect(moves.players[0]!.clubId).toBe(secondClub);

    // Nothing observed on either side: no reshuffle, and no dependence on argument order.
    const neither = mergeSources([
      { players: [withMinutes(a, a.clubId, 0)] },
      { players: [withMinutes(a, secondClub, 0)] },
    ]);
    expect(neither.players[0]!.clubId).toBe(a.clubId);
  });

  it("carries every club and player of both", () => {
    const m = merged();
    expect(m.clubs).toHaveLength(ALL.length);
    expect(m.players).toHaveLength(SAMPLE.players.filter((p) => ALL.includes(p.clubId)).length);
    expect(m.primaryCompetitionId).toBe("BRA1");
  });
});

describe("the artifact a two-tier snapshot emits", () => {
  it("puts the SQUADS of both divisions in one LeagueData", () => {
    /*
     * The other half of the defect, and the one that would have been hardest to see: `emit` built
     * `teams` from the PRIMARY competition's entrants only. The world would have named two divisions
     * while squads existed for one, and a career restricts a division to clubs it has players for —
     * so the second division would have come out empty rather than wrong.
     */
    const { league } = runPipeline(merged());
    expect(league.teams).toHaveLength(ALL.length);
    expect(() => loadLeagueTeams(league)).not.toThrow();
  });

  it("emits a world naming both leagues over clubs it actually has", () => {
    const { league, world } = runPipeline(merged());
    const squads = new Set(league.teams.map((t) => t.id));
    const leagues = world.competitions.filter((c) => c.type === "league");
    expect(leagues).toHaveLength(2);
    for (const l of leagues) {
      expect(l.entrantClubIds.length).toBeGreaterThan(0);
      // Every entrant has a squad, which is the precondition the career's pyramid enforces.
      for (const id of l.entrantClubIds) expect(squads.has(id)).toBe(true);
    }
  });

  it("validates clean and stays deterministic", () => {
    const { report } = runPipeline(merged());
    expect(report.errors).toEqual([]);
    expect(runPipeline(merged())).toEqual(runPipeline(merged()));
  });

  it("still emits a single league from a single-league snapshot", () => {
    // The shape every dataset has had. A pyramid must be something a dataset opts into by describing
    // one, not a change in what one league now means.
    const { league, world } = runPipeline(SAMPLE);
    expect(league.teams).toHaveLength(20);
    expect(world.competitions.filter((c) => c.type === "league")).toHaveLength(1);
  });
});
