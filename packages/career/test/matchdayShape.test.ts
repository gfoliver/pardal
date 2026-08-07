import { describe, expect, it } from "vitest";
import { Formation, Position, PositionGroup, positionGroup } from "@fut/domain";
import { type PoolEntry, RESHAPE_FORCED_COST_LIMIT, RESHAPE_MIN_GAIN, reshapeForMatchday } from "@fut/career";

/**
 * "Is it better to field someone out of position, or to change shape for the day?"
 *
 * Tested over a POOL rather than a career, because the judgement in it is two numbers and a rule and a
 * career would hide both behind twenty other things.
 *
 * The entries are built by hand because the league fixtures cannot show this: their players have FLAT
 * attributes, so every out-of-position move costs the same 15% of the man's own rating and no shape can
 * ever be materially better than another. Here the cost grows with how far the job is from the player's
 * own — free in his own position, {@link NEAR} in his own area of the pitch, {@link LINE} per line
 * beyond it — which is the shape of the real model and the reason a central midfielder covers at
 * defensive midfield long before he covers on the wing.
 */

const NEAR = 8;
const LINE = 20;

const LADDER: Record<PositionGroup, number> = {
  [PositionGroup.Goalkeeper]: 0,
  [PositionGroup.Defence]: 1,
  [PositionGroup.Midfield]: 2,
  [PositionGroup.Attack]: 3,
};

function entry(id: string, pos: Position, ovr: number): PoolEntry {
  const at = (to: Position): number => {
    if (to === pos) return ovr;
    const lines = Math.abs(LADDER[positionGroup(pos)] - LADDER[positionGroup(to)]);
    return ovr - (lines === 0 ? NEAR : LINE * lines);
  };
  return { id, ovr, gk: pos === Position.Goalkeeper, group: positionGroup(pos), pos, ratingAt: at };
}

/**
 * A squad a 4-4-2 fits EXACTLY — every slot has a natural — that owns no wing-backs and is deep in
 * central midfield. So its 4-4-2 starts at a positional cost of zero, and anything the tests see is
 * something an absence forced.
 */
const ROWS: [string, Position, number][] = [
  ["gk1", Position.Goalkeeper, 80],
  ["gk2", Position.Goalkeeper, 60],
  ["fb1", Position.FullBack, 78],
  ["fb2", Position.FullBack, 77],
  ["cb1", Position.CentreBack, 76],
  ["cb2", Position.CentreBack, 75],
  ["cb3", Position.CentreBack, 62],
  ["w1", Position.Winger, 74],
  ["w2", Position.Winger, 73],
  ["cm1", Position.CentralMidfielder, 72],
  ["cm2", Position.CentralMidfielder, 71],
  ["cm3", Position.CentralMidfielder, 70],
  ["cm4", Position.CentralMidfielder, 69],
  ["st1", Position.Striker, 68],
  ["st2", Position.Striker, 67],
  ["st3", Position.Striker, 61],
];

const squad = ROWS.map(([id, pos, ovr]) => entry(id, pos, ovr));
const without = (...ids: string[]) => squad.filter((p) => !ids.includes(p.id));

describe("the matchday shape decision", () => {
  it("keeps the shape when nobody is missing", () => {
    expect(reshapeForMatchday(squad, squad, Formation.F442)).toBeUndefined();
  });

  it("keeps a shape the squad permanently fits badly — that is the manager's trade-off, not an emergency", () => {
    // A 3-5-2 asks for two wing-backs this squad has never had, and always will. Because the trigger is
    // the DIFFERENCE the absences make, a standing cost like that can never set it off — so a manager
    // who wants a back three keeps it instead of having it quietly overruled every week.
    expect(reshapeForMatchday(squad, squad, Formation.F352)).toBeUndefined();
    expect(reshapeForMatchday(without("cm4"), squad, Formation.F352)).toBeUndefined();
  });

  it("keeps the shape when one absence is covered from the same area of the pitch", () => {
    // A winger out, a spare striker across to the wing: NEAR points, under the limit. This is the case
    // the limit exists to allow — covering in the same area of the pitch is ordinary football.
    expect(NEAR).toBeLessThanOrEqual(RESHAPE_FORCED_COST_LIMIT);
    expect(reshapeForMatchday(without("w2"), squad, Formation.F442)).toBeUndefined();
  });

  it("changes shape when the absences leave it asking for players the club has not got", () => {
    // BOTH wingers out. A 4-4-2 has to staff two wide slots from a squad with nobody wide left, which
    // drags a central midfielder a whole line up the pitch. A shape with no wide slots at all takes the
    // same players and asks each of them for a job he nearly knows.
    const shape = reshapeForMatchday(without("w1", "w2"), squad, Formation.F442);
    expect(shape).toBeDefined();
    expect(shape!.formation).not.toBe(Formation.F442);
    expect(shape!.lineup).toHaveLength(11);
    expect(shape!.lineup.filter(Boolean)).toHaveLength(11);
    // A keeper is still in goal, and everyone fielded can actually play today.
    expect(shape!.lineup[0]).toBe("gk1");
    const fit = new Set(without("w1", "w2").map((p) => p.id));
    for (const id of shape!.lineup) expect(fit.has(id)).toBe(true);
    // Nobody is named twice — the engine's agent index is keyed by player id.
    expect(new Set(shape!.lineup).size).toBe(11);
    // Every starter is given a role for the job he is doing.
    for (const id of shape!.lineup) expect(shape!.roles[id]).toBeDefined();
  });

  it("is deterministic — input order cannot change the answer", () => {
    const short = without("w1", "w2");
    expect(reshapeForMatchday(short, squad, Formation.F442)).toEqual(reshapeForMatchday([...short].reverse(), squad, Formation.F442));
  });

  it("states its two thresholds in rating points, and the gain is the smaller of them", () => {
    // Pinned because they ARE the decision. Each carries its reasoning in a comment on the constant;
    // this only guards the relationship — a shape must not be abandoned for less than it took to ask
    // the question, or a club would swap shape every time somebody twisted an ankle.
    expect(RESHAPE_FORCED_COST_LIMIT).toBe(12);
    expect(RESHAPE_MIN_GAIN).toBe(6);
    expect(RESHAPE_MIN_GAIN).toBeLessThan(RESHAPE_FORCED_COST_LIMIT);
  });
});
