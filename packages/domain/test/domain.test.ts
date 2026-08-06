import { describe, expect, it } from "vitest";
import {
  Formation,
  Goalkeeper,
  MarkingScheme,
  MatchRules,
  Mentality,
  Player,
  Position,
  RoleKey,
  SubstitutionRules,
  TacticsBuilder,
  getRole,
} from "@fut/domain";

function attrs(v: number) {
  return {
    physical: { pace: v, stamina: v, strength: v, agility: v },
    mental: {
      decisions: v,
      composure: v,
      workRate: v,
      teamwork: v,
      aggression: v,
      anticipation: v,
      positioning: v,
      vision: v, offTheBall: v,
    },
    technical: {
      passing: v,
      technique: v,
      dribbling: v,
      finishing: v,
      shotPower: v,
      tackling: v,
      marking: v,
      crossing: v, firstTouch: v, heading: v,
    },
  };
}

function striker(id: string, v = 12): Player {
  return new Player({
    id,
    name: id,
    age: 24,
    nationality: "BR",
    position: Position.Striker,
    ...attrs(v),
  });
}

function keeper(id: string, v = 12): Goalkeeper {
  return new Goalkeeper({
    id,
    name: id,
    age: 28,
    nationality: "BR",
    ...attrs(v),
    goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v },
  });
}

describe("Domain hierarchy", () => {
  it("Goalkeeper is a Player (LSP) with keeper-weighted overall", () => {
    const gk = keeper("gk", 15);
    expect(gk).toBeInstanceOf(Player);
    expect(gk.isGoalkeeper()).toBe(true);
    expect(gk.overall()).toBeGreaterThan(0);
  });
});

describe("TacticsBuilder (simple mode / dual-mode)", () => {
  it("fills a default role per starter from just formation + mentality", () => {
    const xi = [keeper("gk"), striker("fw")];
    const tactics = new TacticsBuilder().simple(xi, {
      mentality: Mentality.Attacking,
    });
    expect(tactics.roleFor("gk")?.key).toBe(RoleKey.Goalkeeper);
    expect(tactics.roleFor("fw")?.key).toBe(RoleKey.Poacher);
    expect(tactics.instructions.mentality).toBe(Mentality.Attacking);
  });

  it("advanced mode lets a role be overridden", () => {
    const xi = [striker("fw")];
    const tactics = new TacticsBuilder().advanced(
      xi,
      new Map([["fw", getRole(RoleKey.FalseNine)]]),
      {
        formation: Formation.F442,
        mentality: Mentality.Balanced,
        tempo: 0.5,
        pressing: 0.5,
        lineHeight: 0.5,
        width: 0.5,
        directness: 0.5,
        markingScheme: MarkingScheme.Zonal,
      },
    );
    expect(tactics.roleFor("fw")?.key).toBe(RoleKey.FalseNine);
  });
});

describe("Injectable rules", () => {
  it("Brasileirão substitution rules: 5 subs across 3 windows", () => {
    const r = SubstitutionRules.brasileirao();
    expect(r.maxSubstitutions).toBe(5);
    expect(r.maxWindows).toBe(3);
    expect(r.halftimeCountsAsWindow).toBe(false);
  });

  it("MatchRules: league has no extra time; knockout has ET + shootout", () => {
    expect(MatchRules.league().hasExtraTime).toBe(false);
    expect(MatchRules.league().hasPenaltyShootout).toBe(false);
    expect(MatchRules.knockout().hasExtraTime).toBe(true);
    expect(MatchRules.knockout().hasPenaltyShootout).toBe(true);
  });
});

function playerWith(
  id: string,
  position: Position,
  technicalOverrides: Partial<{
    finishing: number;
    tackling: number;
    marking: number;
  }>,
  naturalPositions?: Position[],
): Player {
  const base = attrs(60);
  return new Player({
    id,
    name: id,
    age: 25,
    nationality: "BR",
    position,
    naturalPositions,
    physical: base.physical,
    mental: base.mental,
    technical: { ...base.technical, ...technicalOverrides },
  });
}

describe("Position-weighted overall", () => {
  it("weights attributes by what the position needs", () => {
    const finisher = playerWith("f", Position.Striker, { finishing: 95, tackling: 30 });
    const stopper = playerWith("s", Position.CentreBack, { finishing: 30, tackling: 95, marking: 95 });
    // Finishing dominates a striker's rating; marking/tackling a centre back's.
    expect(finisher.overall(Position.Striker)).toBeGreaterThan(
      stopper.overall(Position.Striker),
    );
    expect(stopper.overall(Position.CentreBack)).toBeGreaterThan(
      finisher.overall(Position.CentreBack),
    );
  });
});

describe("Versatility and out-of-position debuff", () => {
  it("a specialist is debuffed out of position; a versatile player is not", () => {
    const striker = playerWith("st", Position.Striker, {});
    const versatile = playerWith("v", Position.Striker, {}, [
      Position.Striker,
      Position.CentreBack,
    ]);

    expect(striker.canPlay(Position.CentreBack)).toBe(false);
    expect(versatile.canPlay(Position.CentreBack)).toBe(true);

    // Identical attributes, but the specialist takes the out-of-position debuff.
    expect(versatile.overall(Position.CentreBack)).toBeGreaterThan(
      striker.overall(Position.CentreBack),
    );
    expect(striker.familiarity(Position.CentreBack)).toBeLessThan(1);
    expect(versatile.familiarity(Position.CentreBack)).toBe(1);
  });
});

describe("Winger roles", () => {
  it("provides multiple wide roles", () => {
    expect(getRole(RoleKey.Winger).key).toBe(RoleKey.Winger);
    expect(getRole(RoleKey.InsideForward).key).toBe(RoleKey.InsideForward);
    expect(getRole(RoleKey.WideMidfielder).key).toBe(RoleKey.WideMidfielder);
  });
});
