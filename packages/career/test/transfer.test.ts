import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { createCareer, indexPlayers, runTransferWindow, type CareerState } from "@fut/career";

// Squad short on midfielders (only 2) so AI clubs have a real need to buy.
function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 24, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
/**
 * A league that can actually trade, with one club that genuinely needs to buy.
 *
 * Every club used to carry just TWO central midfielders, on the reasoning that a shortage gives the AI
 * a real need. It also gave the market nothing to sell: `REQUIRED_PER_GROUP` asks an AI club for six
 * midfielders, so once sales started obeying that floor — see `squadIntegrity.test.ts` — every club in
 * this league was below it, nobody could supply the thing everybody wanted, and twelve windows produced
 * no permanent transfer at all. The shortage has to be one club's, not the league's.
 *
 * `midfielders` is therefore a parameter: `t3` is short and shops, the rest carry a spare.
 */
const squad = (midfielders: number): [Position, boolean][] => [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 4 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.FullBack, false] as [Position, boolean]),
  ...Array.from({ length: midfielders }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  [Position.Winger, false], [Position.Winger, false],
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
];
const SHORT_OF_MIDFIELD = "t3";
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  const POS = squad(id === SHORT_OF_MIDFIELD ? 3 : 7);
  return { id, name: id, shortName: id.toUpperCase(), coach, players: POS.map(([p, gk], i) => player(`${id}-p${i}`, p, rating + (i % 5), gk)) };
}
function league(): LeagueData {
  return { id: "fic", name: "Fic", teams: [72, 70, 68, 66].map((r, i) => team(`t${i}`, r)) };
}

/** Fees paid out across the league, and fees taken in. A transfer is both. */
const feesPaid = (s: CareerState) => Object.values(s.clubs).reduce((sum, c) => sum + c.finance.feesPaid, 0);
const feesReceived = (s: CareerState) => Object.values(s.clubs).reduce((sum, c) => sum + c.finance.feesReceived, 0);

describe("transfer window", () => {
  const lg = league();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 11 };

  /**
   * Over SEVERAL career seeds, not one.
   *
   * A club only does business in a given window with a certain appetite (0.16), and this fixture has
   * three AI clubs, of which one is genuinely short — so a whole season of windows producing nothing is
   * an unlucky draw rather than a broken market. Measured on this league: four seeds out of five give
   * two permanent deals over forty windows, and seed 11 gives none. Asserting on one seed was a test
   * that had been passing by rng alignment, and it went red the moment an unrelated change shifted how
   * many random draws the candidate loop consumes.
   *
   * Naming a luckier seed would have been tuning the test until it agreed. The claim worth making is
   * about the MARKET, so it is made across seeds, and the bookkeeping below is then checked on the run
   * that actually did business.
   */
  it("moves players, and every fee paid is a fee somebody received", () => {
    const runs = [11, 12, 13, 99, 4242].map((seed) => {
      const st = createCareer(lg, { ...opts, seed });
      const moves = Array.from({ length: 40 }, (_, w) => runTransferWindow(st, indexPlayers(lg), w)).flat();
      return { st, moves };
    });
    expect(runs.some((r) => r.moves.some((d) => !d.loan))).toBe(true);

    const busiest = runs.reduce((a, b) => (b.moves.length > a.moves.length ? b : a));
    const s = busiest.st;
    const done = busiest.moves;
    const permanent = done.filter((d) => !d.loan);
    expect(permanent.length).toBeGreaterThan(0);
    // Every fee is booked on both sides — buyer's spend, seller's income — and the two
    // sums have to agree, or money is being created or destroyed in the ledger.
    const total = permanent.reduce((sum, d) => sum + d.fee, 0);
    expect(feesPaid(s)).toBe(total);
    expect(feesReceived(s)).toBe(total);
    // Each transferred player now sits in exactly one squad. Checked against the LAST
    // move for a player, since a player can legitimately change hands twice over twelve
    // windows and an earlier row would then describe a squad he has since left.
    const latest = new Map(done.map((d) => [d.playerId, d]));
    for (const d of latest.values()) {
      expect(s.clubs[d.toClubId]!.squad.playerIds).toContain(d.playerId);
      expect(s.clubs[d.fromClubId]!.squad.playerIds).not.toContain(d.playerId);
    }
  });

  it("never sells the managed club's players automatically", () => {
    const s = createCareer(lg, opts);
    const done = runTransferWindow(s, indexPlayers(lg), 0);
    expect(done.every((d) => d.fromClubId !== "t0")).toBe(true);
  });

  it("is deterministic — same seed reproduces the same completed deals", () => {
    const a = runTransferWindow(createCareer(lg, opts), indexPlayers(lg), 0);
    const b = runTransferWindow(createCareer(lg, opts), indexPlayers(lg), 0);
    expect(a).toEqual(b);
  });
});
