import { describe, expect, it } from "vitest";
import { Position, RoleKey } from "@fut/domain";
import type { LeagueData, PlayerData, TeamData } from "@fut/competition";
import { Career } from "@fut/career";

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
const SQUAD: [Position, boolean][] = [
  [Position.Goalkeeper, true], [Position.Goalkeeper, true],
  [Position.CentreBack, false], [Position.CentreBack, false], [Position.CentreBack, false],
  [Position.FullBack, false], [Position.FullBack, false], [Position.FullBack, false],
  [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false], [Position.CentralMidfielder, false],
  [Position.Winger, false], [Position.Winger, false],
  [Position.Striker, false], [Position.Striker, false],
];
function team(id: string, rating: number): TeamData {
  const coach = { id: `${id}-c`, name: "C", age: 50, nationality: "BR", attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 } };
  return { id, name: id.toUpperCase(), shortName: id.slice(0, 3).toUpperCase(), coach, players: SQUAD.map(([pos, gk], i) => player(`${id}-p${i}`, pos, rating - i, gk)) };
}
const league: LeagueData = { id: "fic", name: "Fic", teams: [team("t0", 80), team("t1", 74)] };
const opts = { leagueId: "fic", managedClubId: "t0", seed: 5 };

function xiIds(c: Career): string[] {
  const fx = c.nextUserFixture()!.fixture;
  const { home, away } = c.buildTeams(fx);
  const mine = [home, away].find((t) => t.id === "t0")!;
  return mine.startingXi.map((p) => p.id);
}

describe("tactics", () => {
  it("auto-migrates a full XI + bench with a keeper", () => {
    const c = Career.create(league, opts);
    const v = c.tacticsView()!;
    expect(v.slots).toHaveLength(11);
    expect(v.slots[0]!.position).toBe(Position.Goalkeeper);
    expect(v.slots[0]!.player).toBeDefined();
    expect(v.bench.length).toBeGreaterThan(0);
  });

  it("setLineupSlot promotes a bench player and benches the displaced starter", () => {
    const c = Career.create(league, opts);
    const before = c.tacticsView()!;
    const benchPlayer = before.bench[0]!.playerId;
    const starterAt10 = before.slots[10]!.player!.playerId;
    c.setLineupSlot(10, benchPlayer);
    const after = c.tacticsView()!;
    expect(after.slots[10]!.player!.playerId).toBe(benchPlayer);
    expect(after.bench.some((b) => b.playerId === starterAt10)).toBe(true);
    // The fielded XI reflects the change.
    expect(xiIds(c)).toContain(benchPlayer);
    expect(xiIds(c)).not.toContain(starterAt10);
  });

  it("setPlayerRole persists a role", () => {
    const c = Career.create(league, opts);
    const pid = c.tacticsView()!.slots[10]!.player!.playerId;
    c.setPlayerRole(pid, RoleKey.FalseNine);
    expect(c.tacticsView()!.slots[10]!.player!.role).toBe(RoleKey.FalseNine);
  });

  it("fields the chosen XI and replaces an injured starter (still 11 + GK)", () => {
    const c = Career.create(league, opts);
    const snap = c.snapshot();
    const gkId = c.tacticsView()!.slots[0]!.player!.playerId;
    // Injure a non-GK starter.
    const outfielderSlot = c.tacticsView()!.slots[5]!.player!.playerId;
    snap.playerDev[outfielderSlot]!.injury = { type: "knock", outUntil: { season: 5, dayOfSeason: 0 } } as never;
    const ids = xiIds(c);
    expect(ids).toHaveLength(11);
    expect(ids).toContain(gkId);
    expect(ids).not.toContain(outfielderSlot);
  });

  it("setFormation is deterministic and keeps 11 fielded", () => {
    const a = Career.create(league, opts);
    a.autoPickLineup();
    const b = Career.create(league, opts);
    b.autoPickLineup();
    expect(a.tacticsView()).toEqual(b.tacticsView());
  });
});
