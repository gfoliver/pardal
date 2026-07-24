import { describe, expect, it } from "vitest";
import { Position } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { CareerRunner, createCareer, indexPlayers } from "@fut/career";

// --- tiny deterministic league fixture -------------------------------------
function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: { decisions: v, composure: v, workRate: v, teamwork: v, aggression: v, anticipation: v, positioning: v, vision: v },
    technical: { passing: v, technique: v, dribbling: v, finishing: v, shotPower: v, tackling: v, marking: v, crossing: v },
  };
}
function player(id: string, position: Position, v: number, gk = false): PlayerData {
  return { id, name: id, age: 25, nationality: "BR", position, ...attrs(v), ...(gk ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } } : {}) };
}
// A 442-friendly 16-man squad at rating v.
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
  const players = SQUAD_POS.map(([pos, gk], i) => player(`${id}-p${i}`, pos, rating, gk));
  return { id, name: id.toUpperCase(), shortName: id.slice(0, 3).toUpperCase(), coach, players };
}
function makeLeague(): LeagueData {
  const ratings = [78, 74, 70, 66, 62, 58];
  return { id: "fic", name: "Série Fictícia", teams: ratings.map((r, i) => team(`t${i}`, r)) };
}

describe("career season (headless)", () => {
  const league = makeLeague();
  const opts = { leagueId: "fic", managedClubId: "t0", seed: 7 };

  function run() {
    const state = createCareer(league, opts);
    const runner = new CareerRunner(state, indexPlayers(league));
    runner.simulateSeason();
    return runner;
  }

  it("plays a full double round-robin (10 games each for 6 teams)", () => {
    const r = run();
    expect(r.seasonComplete).toBe(true);
    const table = r.table("league");
    expect(table).toHaveLength(6);
    for (const row of table) expect(row.played).toBe(10);
  });

  it("produces goals", () => {
    const r = run();
    const totalGoals = r.table("league").reduce((s, row) => s + row.goalsFor, 0);
    expect(totalGoals).toBeGreaterThan(0);
  });

  it("is deterministic — same seed reproduces the exact final table", () => {
    const a = run().table("league");
    const b = run().table("league");
    expect(a).toEqual(b);
  });
});
