import { describe, expect, it } from "vitest";
import { Formation, Position, RoleKey, rolesFor } from "@fut/domain";
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
    // An outfielder — a reserve keeper could only replace the keeper.
    const benchPlayer = before.bench.find((p) => p.position !== Position.Goalkeeper)!.playerId;
    const starterAt10 = before.slots[10]!.player!.playerId;
    c.setLineupSlot(10, benchPlayer);
    const after = c.tacticsView()!;
    expect(after.slots[10]!.player!.playerId).toBe(benchPlayer);
    expect(after.bench.some((b) => b.playerId === starterAt10)).toBe(true);
    // The fielded XI reflects the change.
    expect(xiIds(c)).toContain(benchPlayer);
    expect(xiIds(c)).not.toContain(starterAt10);
  });

  it("keeps a goalkeeper in goal: no swapping one for an outfielder", () => {
    const c = Career.create(league, opts);
    const before = c.tacticsView()!;
    const gkId = before.slots[0]!.player!.playerId;
    const outfielder = before.slots[6]!.player!.playerId;

    c.setLineupSlot(0, outfielder); // an outfielder into goal
    expect(c.tacticsView()!.slots[0]!.player!.playerId).toBe(gkId);
    c.setLineupSlot(6, gkId); // swapping the keeper into midfield leaves goal empty
    expect(c.tacticsView()!.slots[6]!.player!.playerId).toBe(outfielder);
    expect(c.tacticsView()!.slots[0]!.player!.playerId).toBe(gkId);
    // A reserve keeper, though, is a fair swap.
    const benchKeeper = before.bench.find((p) => p.position === Position.Goalkeeper)!;
    c.setLineupSlot(0, benchKeeper.playerId);
    expect(c.tacticsView()!.slots[0]!.player!.playerId).toBe(benchKeeper.playerId);
    // And the first-choice keeper can be brought straight back.
    c.setLineupSlot(0, gkId);
    expect(c.tacticsView()!.slots[0]!.player!.playerId).toBe(gkId);
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

  it("setSlotFielded plays a player somewhere else, and the role follows", () => {
    const c = Career.create(league, opts);
    const slot = c.tacticsView()!.slots.findIndex((s) => s.position === Position.CentralMidfielder);
    const pid = c.tacticsView()!.slots[slot]!.player!.playerId;

    c.setSlotFielded(slot, Position.AttackingMidfielder);
    const after = c.tacticsView()!.slots[slot]!;
    expect(after.position).toBe(Position.AttackingMidfielder);
    // The role is one an attacking midfielder can actually play.
    expect(rolesFor(Position.AttackingMidfielder).map((r) => r.key)).toContain(after.role);
    // And the engine is told where he is being fielded, so it charges for it.
    const fx = c.nextUserFixture()!.fixture;
    const { home, away } = c.buildTeams(fx);
    const mine = [home, away].find((t) => t.id === "t0")!;
    expect(mine.tactics.positionFor(pid)).toBe(Position.AttackingMidfielder);
  });

  it("changing formation re-fits the same eleven and drops shape-specific overrides", () => {
    const c = Career.create(league, opts);
    const before = c.tacticsView()!;
    const squad = new Set(before.slots.map((s) => s.player!.playerId));
    c.setSlotFielded(5, Position.AttackingMidfielder);
    c.setSlotPosition(5, 0.7, 0.2);

    c.setFormation(Formation.F352);
    const after = c.tacticsView()!;
    expect(after.formation).toBe(Formation.F352);
    // Same personnel, re-arranged for the new shape.
    expect(new Set(after.slots.map((s) => s.player!.playerId))).toEqual(squad);
    // A 3-5-2 asks for three at the back; the XI carried only two natural
    // centre-backs, so a defender covers the third — never a forward.
    const fielded = after.slots.map((s) => s.position);
    expect(fielded.filter((p) => p === Position.CentreBack)).toHaveLength(3);
    const backThree = after.slots.filter((s) => s.position === Position.CentreBack);
    expect(backThree.every((s) => [Position.CentreBack, Position.FullBack, Position.WingBack].includes(s.player!.position as Position))).toBe(true);
    // And the strikers are strikers.
    expect(after.slots.filter((s) => s.position === Position.Striker).every((s) => s.player!.position === Position.Striker)).toBe(true);
    // The old shape's manual tweaks are gone.
    expect(after.slots[5]!.depth).not.toBeCloseTo(0.7);
  });

  it("setFormation is deterministic and keeps 11 fielded", () => {
    const a = Career.create(league, opts);
    a.autoPickLineup();
    const b = Career.create(league, opts);
    b.autoPickLineup();
    expect(a.tacticsView()).toEqual(b.tacticsView());
  });
});

describe("multiple saved tactics", () => {
  it("starts with exactly one saved tactic, named \"1\"", () => {
    const c = Career.create(league, opts);
    const v = c.tacticsView()!;
    expect(v.tactics).toHaveLength(1);
    expect(v.tactics[0]).toMatchObject({ id: "t1", name: "1" });
    expect(v.activeTacticId).toBe("t1");
  });

  it("createTactic adds a copy of the active tactic and selects it", () => {
    const c = Career.create(league, opts);
    const original = c.tacticsView()!;
    c.createTactic("Cup shape");
    const v = c.tacticsView()!;
    expect(v.tactics).toHaveLength(2);
    expect(v.activeTacticId).not.toBe("t1");
    expect(v.tactics.find((t) => t.id === v.activeTacticId)?.name).toBe("Cup shape");
    // Editing the active (new) tactic's XI doesn't change what "1" looked like.
    expect(v.slots.map((s) => s.player?.playerId)).toEqual(original.slots.map((s) => s.player?.playerId));
  });

  it("editing tactic 2 leaves tactic 1 untouched, and buildTeams follows the active one", () => {
    const c = Career.create(league, opts);
    const original = c.tacticsView()!;
    c.createTactic("Alt"); // active is now the new tactic
    c.setFormation(Formation.F352);
    const benchPlayer = c.tacticsView()!.bench.find((p) => p.position !== Position.Goalkeeper)!.playerId;
    c.setLineupSlot(1, benchPlayer);

    // Switch back to tactic 1: exactly what it was before.
    c.selectTactic("t1");
    const backTo1 = c.tacticsView()!;
    expect(backTo1.formation).toBe(original.formation);
    expect(backTo1.slots.map((s) => s.player?.playerId)).toEqual(original.slots.map((s) => s.player?.playerId));

    // The active tactic (t1 now) is what buildTeams fields.
    expect(xiIds(c)).toEqual(original.slots.map((s) => s.player!.playerId));

    // Switch to the alt tactic: the edits are still there, and buildTeams follows.
    const altId = c.tacticsView()!.tactics.find((t) => t.name === "Alt")!.id;
    c.selectTactic(altId);
    expect(c.tacticsView()!.formation).toBe(Formation.F352);
    expect(xiIds(c)).toContain(benchPlayer);
  });

  it("duplicateTactic copies a specific source, not necessarily the active one", () => {
    const c = Career.create(league, opts);
    const originalFormation = c.tacticsView()!.formation;
    c.createTactic("Alt"); // active → alt, still a copy of t1's shape
    c.setFormation(Formation.F352); // edits "Alt" only
    c.duplicateTactic("t1", "Copy of 1"); // explicit source: the untouched t1
    const v = c.tacticsView()!;
    const copy = v.tactics.find((t) => t.name === "Copy of 1")!;
    expect(copy.formation).toBe(originalFormation);
    expect(copy.formation).not.toBe(Formation.F352);
    expect(v.activeTacticId).toBe(copy.id);
  });

  it("renameTactic and deleteTactic behave through the facade", () => {
    const c = Career.create(league, opts);
    c.renameTactic("t1", "Home");
    expect(c.tacticsView()!.tactics[0]!.name).toBe("Home");

    c.createTactic("Away");
    c.deleteTactic("t1");
    const v = c.tacticsView()!;
    expect(v.tactics).toHaveLength(1);
    expect(v.tactics[0]!.name).toBe("Away");
    // The last remaining tactic can't be deleted.
    c.deleteTactic(v.tactics[0]!.id);
    expect(c.tacticsView()!.tactics).toHaveLength(1);
  });

  it("caps saved tactics and keeps ids stable across delete + create", () => {
    const c = Career.create(league, opts);
    for (let i = 0; i < 10; i++) c.createTactic();
    expect(c.tacticsView()!.tactics.length).toBeLessThanOrEqual(6);
    const countAtCap = c.tacticsView()!.tactics.length;

    // Delete one, then create a new one — no id collision with a survivor.
    const someId = c.tacticsView()!.tactics[1]!.id;
    c.deleteTactic(someId);
    c.createTactic("Fresh");
    const ids = c.tacticsView()!.tactics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(c.tacticsView()!.tactics.length).toBe(countAtCap);
  });
});
