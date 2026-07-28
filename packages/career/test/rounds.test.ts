import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career } from "@fut/career";

/**
 * The fixture list, round by round.
 *
 * The league screen shows results and upcoming games off ONE structure, so the
 * contract that matters is: a round always lists all its fixtures, scores
 * appear only once played, and the order is the order the season runs in.
 */

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
const POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  ...Array.from({ length: 6 }, () => [Position.CentreBack, false] as [Position, boolean]),
  ...Array.from({ length: 6 }, () => [Position.CentralMidfielder, false] as [Position, boolean]),
  ...Array.from({ length: 4 }, () => [Position.Striker, false] as [Position, boolean]),
];
function team(id: string, r: number): TeamData {
  return {
    id, name: id, shortName: id.toUpperCase(),
    coach: { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } },
    players: POS.map(([p, gk], i) => ({ id: `${id}-p${i}`, name: `${id}-p${i}`, age: 27, nationality: "BR", position: p, ...attrs(r), ...(gk ? { goalkeeping: { reflexes: r, handling: r, positioning: r, oneOnOnes: r } } : {}) } as PlayerData)),
  };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [76, 72, 68, 64].map((r, i) => team(`t${i}`, r)) };
const career = () => Career.create(league, { leagueId: "fic", managedClubId: "t0", seed: 21 });

describe("rounds()", () => {
  it("lists every fixture of the season, grouped and in matchday order", () => {
    const c = career();
    const rounds = c.rounds("league");
    const fixtures = c.snapshot().competitions[0]!.fixtures;

    expect(rounds.length).toBeGreaterThan(0);
    expect(rounds.reduce((n, r) => n + r.matches.length, 0)).toBe(fixtures.length);
    // Chronological: the screen renders them in this order and reverses for
    // "results", so an unsorted list would read as a shuffled season.
    const days = rounds.map((r) => r.day);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("carries no scores before a ball is kicked", () => {
    for (const r of career().rounds("league")) {
      expect(r.complete).toBe(false);
      for (const m of r.matches) {
        expect(m.played).toBe(false);
        expect(m.homeScore).toBeUndefined();
        expect(m.awayScore).toBeUndefined();
      }
    }
  });

  it("fills in the score once the round is played, and only then", () => {
    const c = career();
    c.advance(); // quick-sim the first matchday
    const rounds = c.rounds("league");
    const first = rounds[0]!;
    expect(first.complete).toBe(true);
    for (const m of first.matches) {
      expect(m.played).toBe(true);
      expect(typeof m.homeScore).toBe("number");
    }
    // Everything after it is still untouched.
    expect(rounds.slice(1).every((r) => r.matches.every((m) => !m.played))).toBe(true);
  });

  it("flags our own fixture in each round, so the screen can pick it out", () => {
    for (const r of career().rounds("league")) {
      const mine = r.matches.filter((m) => m.mine);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.homeId === "t0" || mine[0]!.awayId === "t0").toBe(true);
    }
  });

  it("agrees with the table it is derived from", () => {
    const c = career();
    c.simulateSeason();
    const played = c.rounds("league").flatMap((r) => r.matches).filter((m) => m.played);
    const goalsFor = c.table("league").reduce((n, row) => n + row.goalsFor, 0);
    const goalsInRounds = played.reduce((n, m) => n + m.homeScore! + m.awayScore!, 0);
    expect(goalsInRounds).toBe(goalsFor);
  });

  it("is empty for a competition that doesn't exist", () => {
    expect(career().rounds("cup-that-isnt-there")).toEqual([]);
  });
});
