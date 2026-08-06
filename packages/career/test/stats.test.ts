import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career, aggregatePlayerStats } from "@fut/career";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v, offTheBall: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v, firstTouch: v, heading: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 25, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
const SQUAD_POS: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false],
  [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false],
  [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  return { id, name: id.toUpperCase(), shortName: id.slice(0, 3).toUpperCase(), coach, players: SQUAD_POS.map(([pos, gk], i) => player(`${id}-p${i}`, pos, rating, gk)) };
}
function makeLeague(): LeagueData {
  return { id: "fic", name: "Série Fictícia", teams: [78, 74, 70, 66, 62, 58].map((r, i) => team(`t${i}`, r)) };
}

describe("player stats", () => {
  const league = makeLeague();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };

  it("records appearances with plausible ratings after a season", () => {
    const c = Career.create(league, opts);
    c.simulateSeason();
    // A regular starter should have appearances and a rating in [4.5, 10].
    const stats = c.playerStats("t0-p2"); // a centre-back
    expect(stats.appearances).toBeGreaterThan(0);
    expect(stats.avgRating).toBeGreaterThanOrEqual(4.5);
    expect(stats.avgRating).toBeLessThanOrEqual(10);
    // EVERY game, not the last five: the log is no longer truncated by the view model, so a regular
    // starter's row count should match his appearances exactly.
    expect(stats.games.length).toBe(stats.appearances);
    expect(stats.games.length).toBeGreaterThan(5);
  });

  it("hands the log over newest first", () => {
    const c = Career.create(league, opts);
    c.simulateSeason();
    const dated = c.playerStats("t0-p2").games.filter((g) => g.date !== null);
    const keys = dated.map((g) => g.date!.year * 10000 + g.date!.month * 100 + g.date!.day);
    // Descending, because "how is he playing lately" is the question the top of this list answers.
    expect(keys).toEqual([...keys].sort((a, b) => b - a));
  });

  it("aggregated squad goals equal the club's goals for", () => {
    const c = Career.create(league, opts);
    c.simulateSeason();
    const table = c.table("league");
    const t0 = table.find((r) => r.teamId === "t0")!;
    let squadGoals = 0;
    for (let i = 0; i < SQUAD_POS.length; i++) squadGoals += aggregatePlayerStats(c.snapshot().competitions, `t0-p${i}`).goals;
    expect(squadGoals).toBe(t0.goalsFor);
  });

  it("is deterministic — same seed reproduces identical ratings", () => {
    const a = Career.create(league, opts);
    a.simulateSeason();
    const b = Career.create(league, opts);
    b.simulateSeason();
    expect(a.playerStats("t0-p14")).toEqual(b.playerStats("t0-p14"));
  });
});
