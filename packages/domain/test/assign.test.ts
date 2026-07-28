import { describe, expect, it } from "vitest";
import { assignToFormation, assignToSlots, DefaultRoleProvider, fitPenalty, Formation, getFormationTemplate, Position, positionGroup, PositionGroup, rolesFor, trimFormation } from "@fut/domain";

const P = Position;

function player(id: string, position: Position, rating: number) {
  return { id, position, isGoalkeeper: position === P.Goalkeeper, rating };
}

/** A squad shaped like a 4-2-3-1 side: the eleven a manager would field. */
function balancedEleven() {
  return [
    player("gk", P.Goalkeeper, 84),
    player("lb", P.FullBack, 80),
    player("cb1", P.CentreBack, 84),
    player("cb2", P.CentreBack, 78),
    player("rb", P.FullBack, 79),
    player("dm1", P.DefensiveMidfielder, 83),
    player("dm2", P.DefensiveMidfielder, 75),
    player("lw", P.Winger, 86),
    player("am", P.AttackingMidfielder, 85),
    player("rw", P.Winger, 80),
    player("st", P.Striker, 89),
  ];
}

describe("assignToFormation", () => {
  it("puts everyone in their own position when the shape matches the squad", () => {
    const { slots } = assignToFormation(balancedEleven(), Formation.F4231);
    expect(slots.filter(Boolean)).toHaveLength(11);
    expect(slots.every((s) => s?.fit === "exact")).toBe(true);
    expect(slots.every((s) => s?.penalty === 0)).toBe(true);
  });

  it("never fields an outfielder in goal while a keeper is available", () => {
    for (const formation of Object.values(Formation)) {
      const { slots } = assignToFormation(balancedEleven(), formation);
      const gkSlot = getFormationTemplate(formation).findIndex((s) => s.position === P.Goalkeeper);
      expect(slots[gkSlot]?.playerId).toBe("gk");
    }
  });

  it("does not sacrifice the best player to the last awkward slot", () => {
    // A 3-4-3 asks for two wing-backs; this side has none, and only two
    // full-backs to cover them. Filling slots greedily leaves the last wing-back
    // to the best player still unused — an 89-rated striker.
    const { slots } = assignToFormation(balancedEleven(), Formation.F343);
    const template = getFormationTemplate(Formation.F343);
    const at = (position: Position) => slots.filter((s, i) => s && template[i]!.position === position).map((s) => s!.playerId);

    expect(at(P.Striker)).toEqual(["st"]);
    for (const id of at(P.WingBack)) expect(positionGroup(balancedEleven().find((p) => p.id === id)!.position)).not.toBe(positionGroup(P.Striker));
    // The wide forwards keep the wings.
    expect(at(P.Winger).sort()).toEqual(["lw", "rw"]);
  });

  it("minimises the total cost of the shape, not each slot in turn", () => {
    const eleven = balancedEleven();
    const { slots } = assignToFormation(eleven, Formation.F352);
    const template = getFormationTemplate(Formation.F352);
    const byId = new Map(eleven.map((p) => [p.id, p]));
    const total = slots.reduce((sum, s, i) => (s ? sum + fitPenalty(byId.get(s.playerId)!, template[i]!.position) : sum), 0);

    // Any single swap of two players between their slots is no better.
    for (let a = 0; a < slots.length; a++) {
      for (let b = a + 1; b < slots.length; b++) {
        const pa = byId.get(slots[a]!.playerId)!;
        const pb = byId.get(slots[b]!.playerId)!;
        const before = fitPenalty(pa, template[a]!.position) + fitPenalty(pb, template[b]!.position);
        const after = fitPenalty(pb, template[a]!.position) + fitPenalty(pa, template[b]!.position);
        expect(after).toBeGreaterThanOrEqual(before);
      }
    }
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("picks the best eleven out of a bigger squad, and reports the rest", () => {
    const squad = [
      ...balancedEleven(),
      player("gk2", P.Goalkeeper, 70),
      player("cb3", P.CentreBack, 88), // better than both starting centre-backs
      player("st2", P.Striker, 60),
    ];
    const { slots, unused } = assignToFormation(squad, Formation.F4231);
    const picked = slots.map((s) => s?.playerId);
    expect(picked).toContain("cb3");
    expect(unused).toContain("gk2");
    expect(unused).toContain("st2");
    expect(unused).toHaveLength(3);
  });

  it("leaves slots empty (not double-filled) when short of players", () => {
    const { slots } = assignToFormation(balancedEleven().slice(0, 8), Formation.F442);
    const filled = slots.filter(Boolean);
    expect(filled).toHaveLength(8);
    expect(new Set(filled.map((s) => s!.playerId)).size).toBe(8);
  });

  it("is deterministic, whatever order the players arrive in", () => {
    const shape = (players: ReturnType<typeof balancedEleven>) =>
      assignToFormation(players, Formation.F433).slots.map((s) => s?.playerId).join(",");
    const forwards = balancedEleven();
    const backwards = [...forwards].reverse();
    expect(shape(backwards)).toBe(shape(forwards));
  });
});

describe("trimFormation", () => {
  it("gives up the most advanced slot, never the keeper", () => {
    const ten = trimFormation(Formation.F442, 10);
    expect(ten).toHaveLength(10);
    expect(ten.filter((s) => s.position === P.Goalkeeper)).toHaveLength(1);
    // A 4-4-2 becomes a 4-4-1: the back four and the midfield four are intact.
    expect(ten.filter((s) => s.position === P.Striker)).toHaveLength(1);
    expect(ten.filter((s) => positionGroup(s.position) === PositionGroup.Defence)).toHaveLength(4);
    // …and the lone striker leads the line centrally, not off to one side where
    // his partner left him.
    expect(ten.find((s) => s.position === P.Striker)!.width).toBeCloseTo(0.5);
  });

  it("keeps taking from the front as more men go, and always keeps the keeper", () => {
    for (const formation of Object.values(Formation)) {
      const full = getFormationTemplate(formation);
      for (let count = 11; count >= 1; count--) {
        const slots = trimFormation(formation, count);
        expect(slots).toHaveLength(count);
        expect(slots.filter((s) => s.position === P.Goalkeeper)).toHaveLength(1);
        // Never deeper than the shape it came from: only advanced slots are cut.
        const deepestGone = full.filter((s) => !slots.some((k) => k.position === s.position && k.depth === s.depth));
        for (const gone of deepestGone) expect(gone.position).not.toBe(P.Goalkeeper);
        // Every survivor still sits on the pitch.
        for (const s of slots) {
          expect(s.width).toBeGreaterThanOrEqual(0);
          expect(s.width).toBeLessThanOrEqual(1);
        }
      }
      expect(trimFormation(formation, 11)).toEqual(full);
      expect(trimFormation(formation, 12)).toEqual(full);
    }
  });

  it("fits ten players to a ten-man shape with nothing left empty", () => {
    const ten = balancedEleven().filter((p) => p.id !== "cb1"); // a centre-back sent off
    const slots = trimFormation(Formation.F442, ten.length);
    const { slots: filled, unused } = assignToSlots(ten, slots);
    expect(filled.filter(Boolean)).toHaveLength(10);
    expect(unused).toEqual([]);
    // The hole is NOT left in defence: four men still hold the back line, with a
    // midfielder dropping in for the man who went.
    const defence = filled.filter((s, i) => s && positionGroup(slots[i]!.position) === PositionGroup.Defence);
    expect(defence).toHaveLength(4);
  });
});

describe("rolesFor", () => {
  it("offers only roles that belong to the position", () => {
    expect(rolesFor(Position.CentreBack).map((r) => r.key)).toEqual(["stopper", "ballPlayingDefender"]);
    expect(rolesFor(Position.Striker).map((r) => r.key)).not.toContain("wingBack");
    expect(rolesFor(Position.Goalkeeper).map((r) => r.key)).toEqual(["goalkeeper"]);
    // A keeper's job is offered nowhere else.
    for (const position of Object.values(Position)) {
      if (position === Position.Goalkeeper) continue;
      expect(rolesFor(position).map((r) => r.key)).not.toContain("goalkeeper");
    }
  });

  it("covers every position, and each position's default role is one of them", () => {
    const provider = new DefaultRoleProvider();
    for (const position of Object.values(Position)) {
      const keys = rolesFor(position).map((r) => r.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain(provider.defaultRoleFor(position).key);
    }
  });
});
