import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { createCareer, indexPlayers, runTransferWindow, type CareerState } from "@fut/career";

// Squad short on midfielders (only 2) so AI clubs have a real need to buy.
function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 24, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false],
  [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false],
  [Position.Striker, false], [Position.Striker, false], [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  return { id, name: id, shortName: id.toUpperCase(), coach, players: POS.map(([p, gk], i) => player(`${id}-p${i}`, p, rating + (i % 5), gk)) };
}
function league(): LeagueData {
  return { id: "fic", name: "Fic", teams: [72, 70, 68, 66].map((r, i) => team(`t${i}`, r)) };
}

const totalBalance = (s: CareerState) => Object.values(s.clubs).reduce((sum, c) => sum + c.finance.balance, 0);

describe("transfer window", () => {
  const lg = league();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 11 };

  it("moves players and conserves total money across clubs (fees only)", () => {
    const s = createCareer(lg, opts);
    const before = totalBalance(s);
    // Several windows, because a club only does business in a given window with a
    // certain appetite — the market runs every couple of weeks against nineteen clubs,
    // so acting every time would produce hundreds of moves a season. A single window is
    // therefore allowed to be quiet; a run of them is not.
    const done = Array.from({ length: 12 }, (_, w) => runTransferWindow(s, indexPlayers(lg), w)).flat();
    const permanent = done.filter((d) => !d.loan);
    expect(permanent.length).toBeGreaterThan(0);
    // Fees move buyer→seller; total cash is unchanged.
    expect(totalBalance(s)).toBe(before);
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
