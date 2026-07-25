import { describe, expect, it } from "vitest";
import { Formation, MarkingScheme, Mentality, Position } from "@fut/domain";
import { SpatialMatch } from "@fut/spatial";
import { buildTeam } from "@fut/app-cli";

/** A match a few minutes in, so players have moved off their kick-off cells. */
function running(homeFormation = Formation.F442) {
  const home = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 70, formation: homeFormation });
  const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 70, formation: Formation.F433 });
  const m = new SpatialMatch({ home, away, seed: 7 });
  for (let i = 0; i < 600; i++) m.tick(0.1); // ~1 minute of match time
  return { m, home, away };
}

describe("in-match tactical management", () => {
  it("reports the live shape: a cell, a role and remaining fitness per player", () => {
    const { m, home } = running();
    const shape = m.shape(home.id);
    expect(shape).toHaveLength(11);
    expect(shape.filter((p) => p.isGoalkeeper)).toHaveLength(1);
    for (const p of shape) {
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBeLessThanOrEqual(1);
      expect(p.roleKey).not.toBe("");
      expect(p.stamina).toBeGreaterThan(0);
      expect(p.stamina).toBeLessThanOrEqual(1);
      expect(p.overall).toBeGreaterThan(0);
    }
    // Someone has done some running by now.
    expect(shape.some((p) => p.stamina < 1)).toBe(true);
  });

  it("changes formation mid-match, re-fitting the eleven on the pitch", () => {
    const { m, home } = running(Formation.F442);
    const before = m.shape(home.id);
    expect(m.setFormation(home.id, Formation.F343)).toBe(true);
    const after = m.shape(home.id);

    // Same eleven players, new shape.
    expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort());
    expect(m.instructionsOf(home.id)?.formation).toBe(Formation.F343);
    // A 3-4-3 fields three at the back and three up top.
    const fielded = after.map((p) => p.fielded);
    expect(fielded.filter((p) => p === Position.CentreBack)).toHaveLength(3);
    expect(fielded.filter((p) => p === Position.Winger || p === Position.Striker)).toHaveLength(3);
    // The keeper is still the keeper.
    const gk = after.find((p) => p.isGoalkeeper)!;
    expect(gk.fielded).toBe(Position.Goalkeeper);
    expect(gk.depth).toBe(0);
    // Nobody teleports: a reshape only moves the cell they're heading for.
    const posBefore = new Map(m.snapshot().players.map((p) => [p.id, `${p.x},${p.y}`]));
    m.setFormation(home.id, Formation.F433);
    for (const p of m.snapshot().players) expect(`${p.x},${p.y}`).toBe(posBefore.get(p.id));
  });

  it("keeps playing sensibly after a formation change", () => {
    const { m, home } = running();
    m.setFormation(home.id, Formation.F352);
    for (let i = 0; i < 600; i++) m.tick(0.1);
    // Still eleven a side, still on the pitch, still a live match.
    expect(m.shape(home.id)).toHaveLength(11);
    for (const p of m.snapshot().players) {
      expect(p.x).toBeGreaterThan(-1);
      expect(p.x).toBeLessThan(106);
      expect(p.y).toBeGreaterThan(-1);
      expect(p.y).toBeLessThan(69);
    }
  });

  it("moves a single player to another cell without touching anyone else", () => {
    const { m, home } = running();
    const target = m.shape(home.id).find((p) => !p.isGoalkeeper)!;
    const others = m.shape(home.id).filter((p) => p.id !== target.id).map((p) => `${p.id}:${p.depth}:${p.width}`);

    expect(m.movePlayer(target.id, 0.8, 0.15)).toBe(true);
    const after = m.shape(home.id);
    const moved = after.find((p) => p.id === target.id)!;
    expect(moved.depth).toBeCloseTo(0.8);
    expect(moved.width).toBeCloseTo(0.15);
    expect(after.filter((p) => p.id !== target.id).map((p) => `${p.id}:${p.depth}:${p.width}`)).toEqual(others);
    // Out-of-range asks are clamped to the pitch.
    m.movePlayer(target.id, 5, -2);
    const clamped = m.shape(home.id).find((p) => p.id === target.id)!;
    expect(clamped.depth).toBe(1);
    expect(clamped.width).toBe(0);
  });

  it("swaps two team-mates' jobs, cell and role together", () => {
    const { m, home } = running();
    const shape = m.shape(home.id);
    const back = shape.find((p) => p.fielded === Position.FullBack)!;
    const forward = shape.find((p) => p.fielded === Position.Striker)!;

    expect(m.swapPlayers(back.id, forward.id)).toBe(true);
    const after = m.shape(home.id);
    const backNow = after.find((p) => p.id === back.id)!;
    const forwardNow = after.find((p) => p.id === forward.id)!;
    expect(backNow.depth).toBeCloseTo(forward.depth);
    expect(backNow.fielded).toBe(forward.fielded);
    expect(backNow.roleKey).toBe(forward.roleKey);
    expect(forwardNow.depth).toBeCloseTo(back.depth);
    expect(forwardNow.fielded).toBe(back.fielded);
    // Opponents are off limits.
    expect(m.swapPlayers(back.id, m.shape("away")[0]!.id)).toBe(false);
  });

  it("refuses to swap the goalkeeper with an outfielder", () => {
    const { m, home } = running();
    const gk = m.shape(home.id).find((p) => p.isGoalkeeper)!;
    const striker = m.shape(home.id).find((p) => p.fielded === Position.Striker)!;

    expect(m.swapPlayers(gk.id, striker.id)).toBe(false);
    const after = m.shape(home.id);
    expect(after.find((p) => p.id === gk.id)!.fielded).toBe(Position.Goalkeeper);
    expect(after.find((p) => p.id === striker.id)!.fielded).toBe(Position.Striker);
    // Exactly one player is keeping goal, as it should be.
    expect(after.filter((p) => p.fielded === Position.Goalkeeper)).toHaveLength(1);
  });

  it("changes a player's role, and rejects one that does not exist", () => {
    const { m, home } = running();
    const p = m.shape(home.id).find((x) => !x.isGoalkeeper)!;
    expect(m.setRole(p.id, "targetMan")).toBe(true);
    expect(m.shape(home.id).find((x) => x.id === p.id)!.roleKey).toBe("targetMan");
    expect(m.setRole(p.id, "notARole")).toBe(false);
  });

  it("edits every slider and the marking scheme live", () => {
    const { m, home } = running();
    m.setInstructions(home.id, {
      mentality: Mentality.VeryAttacking,
      tempo: 0.9,
      pressing: 0.85,
      lineHeight: 0.8,
      width: 0.75,
      directness: 0.7,
      markingScheme: MarkingScheme.ManToMan,
    });
    const now = m.instructionsOf(home.id)!;
    expect(now.mentality).toBe(Mentality.VeryAttacking);
    expect(now.tempo).toBeCloseTo(0.9);
    expect(now.pressing).toBeCloseTo(0.85);
    expect(now.lineHeight).toBeCloseTo(0.8);
    expect(now.width).toBeCloseTo(0.75);
    expect(now.directness).toBeCloseTo(0.7);
    expect(now.markingScheme).toBe(MarkingScheme.ManToMan);
  });

  it("a substitute inherits the slot, and the shape survives it", () => {
    const { m, home } = running();
    const out = m.shape(home.id).find((p) => !p.isGoalkeeper)!;
    const inPlayer = m.bench(home.id)[0]!;

    expect(m.requestSub(home.id, out.id, inPlayer.id)).toBe(true);
    const after = m.shape(home.id);
    expect(after).toHaveLength(11);
    expect(after.some((p) => p.id === out.id)).toBe(false);
    const on = after.find((p) => p.id === inPlayer.id)!;
    expect(on.depth).toBeCloseTo(out.depth);
    expect(on.width).toBeCloseTo(out.width);
    expect(on.fielded).toBe(out.fielded);
    expect(on.stamina).toBe(1); // fresh legs
    expect(m.subsRemaining(home.id)).toBe(4);
  });

  it("the sim stays deterministic when the same changes are made", () => {
    const play = () => {
      const home = buildTeam({ id: "home", name: "Home", shortName: "HOM", rating: 70 });
      const away = buildTeam({ id: "away", name: "Away", shortName: "AWY", rating: 70 });
      const m = new SpatialMatch({ home, away, seed: 21 });
      for (let i = 0; i < 300; i++) m.tick(0.1);
      m.setFormation(home.id, Formation.F433);
      m.setInstructions(home.id, { pressing: 0.9 });
      const p = m.shape(home.id).find((x) => !x.isGoalkeeper)!;
      m.movePlayer(p.id, 0.6, 0.2);
      for (let i = 0; i < 600; i++) m.tick(0.1);
      return { score: `${m.score.home}-${m.score.away}`, shape: JSON.stringify(m.shape(home.id)) };
    };
    expect(play()).toEqual(play());
  });
});
