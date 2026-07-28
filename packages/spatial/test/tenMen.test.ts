import { describe, expect, it } from "vitest";
import { Formation, Position, PositionGroup, positionGroup, rolesFor } from "@fut/domain";
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

const cells = (shape: { depth: number; width: number }[]) => shape.map((p) => `${p.depth.toFixed(3)}:${p.width.toFixed(3)}`);

describe("a side reduced to ten", () => {
  it("reorganises rather than leaving the hole where the man went", () => {
    const { m, home } = running(Formation.F442);
    const cb = m.shape(home.id).find((p) => p.fielded === Position.CentreBack)!;
    expect(m.sendOffPlayer(cb.id)).toBe(true);

    const after = m.shape(home.id);
    expect(after).toHaveLength(10);
    expect(after.some((p) => p.id === cb.id)).toBe(false);
    expect(after.filter((p) => p.isGoalkeeper)).toHaveLength(1);
    // The back four is still a back four — a midfielder drops in for the man who
    // went, which is the whole point: the gap must not be left in defence.
    expect(after.filter((p) => positionGroup(p.fielded) === PositionGroup.Defence)).toHaveLength(4);
    // The sacrifice comes off the front, and the surviving striker leads the line
    // centrally instead of standing where his partner left him.
    const strikers = after.filter((p) => p.fielded === Position.Striker);
    expect(strikers).toHaveLength(1);
    expect(strikers[0]!.width).toBeCloseTo(0.5);
    // One player per cell, as in any shape.
    expect(new Set(cells(after)).size).toBe(10);
    // The dismissal is on the record.
    const red = m.events.filter((e) => e.params?.sentOff);
    expect(red).toHaveLength(1);
    expect(red[0]!.params?.playerId ?? red[0]!.playerId).toBe(cb.id);
  });

  it("keeps the roles the manager chose wherever the job did not change", () => {
    const { m, home } = running(Formation.F442);
    // Give every outfielder a role that is NOT the default for his slot, so a
    // reset back to defaults would be unmistakable.
    for (const p of m.shape(home.id)) {
      if (p.isGoalkeeper) continue;
      const other = rolesFor(p.fielded).map((r) => r.key).find((k) => k !== p.roleKey);
      if (other) m.setRole(p.id, other);
    }
    const chosen = new Map(m.shape(home.id).map((p) => [p.id, { role: p.roleKey, fielded: p.fielded }]));

    m.sendOffPlayer(m.shape(home.id).find((p) => p.fielded === Position.CentreBack)!.id);

    let unchanged = 0;
    for (const p of m.shape(home.id)) {
      const was = chosen.get(p.id)!;
      if (p.fielded !== was.fielded) continue; // moved job → a new role is right
      unchanged += 1;
      expect(p.roleKey).toBe(was.role);
    }
    expect(unchanged).toBeGreaterThan(5); // most of the side keeps its job
  });

  it("answers a formation change with a full ten-man shape", () => {
    const { m, home } = running(Formation.F442);
    m.sendOffPlayer(m.shape(home.id).find((p) => p.fielded === Position.CentreBack)!.id);

    expect(m.setFormation(home.id, Formation.F433)).toBe(true);
    const after = m.shape(home.id);
    expect(after).toHaveLength(10);
    expect(new Set(cells(after)).size).toBe(10); // no two men sent to one cell
    expect(after.filter((p) => p.isGoalkeeper)).toHaveLength(1);
    expect(m.instructionsOf(home.id)?.formation).toBe(Formation.F433);
  });

  it("plays on sensibly a man down", () => {
    const { m, home, away } = running();
    m.sendOffPlayer(m.shape(home.id).find((p) => !p.isGoalkeeper)!.id);
    for (let i = 0; i < 600; i++) m.tick(0.1);

    expect(m.shape(home.id)).toHaveLength(10);
    expect(m.shape(away.id)).toHaveLength(11);
    for (const p of m.snapshot().players) {
      expect(p.x).toBeGreaterThan(-1);
      expect(p.x).toBeLessThan(106);
      expect(p.y).toBeGreaterThan(-1);
      expect(p.y).toBeLessThan(69);
    }
  });

  it("refuses to send off someone who is not on the pitch", () => {
    const { m } = running();
    expect(m.sendOffPlayer("nobody")).toBe(false);
  });
});
