import { describe, expect, it } from "vitest";
import { computeStandings } from "@fut/competition";
import { Career } from "@fut/career";
import { InboxMessageType } from "../src/inbox/types.js";
import { PLAYERS_TO_FIELD } from "../src/career/CareerRunner.js";
import { fixtureLeague } from "./fixtures.js";

/**
 * A club that cannot field eleven loses by walkover.
 *
 * There is deliberately NO squad floor protecting a manager from getting here — if he lets contracts
 * run down through the warnings, the squad shrinks. What must not happen is the engine being handed a
 * short XI: `buildMatchTeam` returns whatever it can, `Team.goalkeeper()` then comes back undefined
 * and the spatial engine indexes eleven slots, so a match that cannot be played has to be awarded
 * rather than attempted.
 */

const career = () => Career.create(fixtureLeague(), { leagueId: "fic", managedClubId: "t0", seed: 9 });

/** Strip a club down to `keep` players, the way a run of lapsed contracts would. */
function reduceSquad(c: Career, clubId: string, keep: number): void {
  const club = c.snapshot().clubs[clubId]!;
  club.squad.playerIds = club.squad.playerIds.slice(0, keep);
}

describe("a club that cannot put a side out", () => {
  it("loses the fixture instead of handing the engine a short XI", () => {
    const c = career();
    reduceSquad(c, "t0", PLAYERS_TO_FIELD - 1);

    // Would throw or hang if the match were attempted.
    expect(() => c.advance()).not.toThrow();

    const comp = c.snapshot().competitions[0]!;
    const ours = comp.results.filter((r) => r.homeTeamId === "t0" || r.awayTeamId === "t0");
    expect(ours.length).toBeGreaterThan(0);
    for (const r of ours) {
      expect(r.status).toBe("forfeit");
      const conceded = r.homeTeamId === "t0" ? r.awayScore : r.homeScore;
      const scored = r.homeTeamId === "t0" ? r.homeScore : r.awayScore;
      expect(scored).toBe(0);
      expect(conceded).toBe(3);
      // Nobody scored them, so no scorer is credited.
      expect(r.goals).toEqual([]);
    }
  });

  it("awards the points to the club that turned up", () => {
    const c = career();
    reduceSquad(c, "t0", PLAYERS_TO_FIELD - 1);
    c.advance();

    const comp = c.snapshot().competitions[0]!;
    const table = c.table("league");
    const opponentIds = comp.results
      .filter((r) => r.status === "forfeit")
      .map((r) => (r.homeTeamId === "t0" ? r.awayTeamId : r.homeTeamId));
    for (const id of opponentIds) {
      expect(table.find((row) => row.teamId === id)!.points, id).toBe(3);
    }
    expect(table.find((row) => row.teamId === "t0")!.points).toBe(0);
  });

  /**
   * The guard that makes the above work: `computeStandings` counts only `confirmed` by default,
   * which is right for the multiplayer protocol it was written for and wrong here.
   */
  it("counts a forfeit in the table, unlike the default", () => {
    const c = career();
    reduceSquad(c, "t0", PLAYERS_TO_FIELD - 1);
    c.advance();
    const comp = c.snapshot().competitions[0]!;

    const awarded = comp.results.find((r) => r.status === "forfeit")!;
    const winner = awarded.homeTeamId === "t0" ? awarded.awayTeamId : awarded.homeTeamId;
    // Default include drops it entirely — the club that turned up would get nothing.
    expect(computeStandings(comp.teamIds, comp.results).find((r) => r.teamId === winner)!.points).toBe(0);
    expect(c.table("league").find((r) => r.teamId === winner)!.points).toBe(3);
  });

  it("tells the manager how far short he was", () => {
    const c = career();
    reduceSquad(c, "t0", 8);
    c.advance();

    const msg = c.inbox().find((m) => m.type === InboxMessageType.FixtureForfeited);
    expect(msg).toBeDefined();
    expect(msg!.params.ours).toBe(true);
    expect(msg!.params.available).toBe(8);
    expect(msg!.params.needed).toBe(PLAYERS_TO_FIELD);
  });

  it("still plays the fixture when the squad is exactly eleven", () => {
    const c = career();
    reduceSquad(c, "t0", PLAYERS_TO_FIELD);
    c.advance();

    const comp = c.snapshot().competitions[0]!;
    const ours = comp.results.filter((r) => r.homeTeamId === "t0" || r.awayTeamId === "t0");
    expect(ours.length).toBeGreaterThan(0);
    for (const r of ours) expect(r.status).toBeUndefined(); // played, not awarded
  });

  it("gives neither side anything when both fail to turn up", () => {
    const c = career();
    const comp0 = c.snapshot().competitions[0]!;
    const first = comp0.fixtures[0]!;
    reduceSquad(c, first.homeTeamId, 5);
    reduceSquad(c, first.awayTeamId, 5);
    c.advance();

    const r = c.snapshot().competitions[0]!.results.find(
      (x) => x.homeTeamId === first.homeTeamId && x.awayTeamId === first.awayTeamId,
    )!;
    expect(r.status).toBe("void");
    expect([r.homeScore, r.awayScore]).toEqual([0, 0]);
    // A void contributes nothing — not even the point a 0-0 would.
    const table = c.table("league");
    expect(table.find((x) => x.teamId === first.homeTeamId)!.played).toBe(0);
    expect(table.find((x) => x.teamId === first.awayTeamId)!.played).toBe(0);
  });

  /** A run-down squad does not recover between rounds, so the watch flow must not stall on it. */
  it("does not strand the season when his club can never field a side", () => {
    const c = career();
    reduceSquad(c, "t0", 6);
    expect(() => c.simulateSeason()).not.toThrow();
    expect(c.snapshot().competitions[0]!.playedFixtureIndexes.length).toBe(
      c.snapshot().competitions[0]!.fixtures.length,
    );
  });
});
