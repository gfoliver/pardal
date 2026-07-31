import { describe, expect, it } from "vitest";
import { Formation, Goalkeeper, MarkingScheme, Mentality, Position, RoleKey } from "@fut/domain";
import { buildTeam, TeamBuildError } from "../src/teamBuilder.js";
import type { TeamInput } from "../src/match.js";
import type { RosterClub, RosterPlayer } from "../src/roster.js";

const attrs = (v: number) => ({
  physical: { pace: v, stamina: v, strength: v, agility: v },
  mental: {
    decisions: v, composure: v, workRate: v, teamwork: v,
    aggression: v, anticipation: v, positioning: v, vision: v,
  },
  technical: {
    passing: v, technique: v, dribbling: v, finishing: v,
    shotPower: v, tackling: v, marking: v, crossing: v,
  },
});

const player = (id: string, position: Position, v = 70): RosterPlayer => ({
  id,
  name: `Player ${id}`,
  age: 25,
  nationality: "BR",
  position,
  ...attrs(v),
  ...(position === Position.Goalkeeper
    ? { goalkeeping: { reflexes: v, handling: v, positioning: v, oneOnOnes: v } }
    : {}),
});

const XI: readonly [string, Position][] = [
  ["gk", Position.Goalkeeper],
  ["lb", Position.FullBack],
  ["cb1", Position.CentreBack],
  ["cb2", Position.CentreBack],
  ["rb", Position.FullBack],
  ["lm", Position.Winger],
  ["cm1", Position.CentralMidfielder],
  ["cm2", Position.CentralMidfielder],
  ["rm", Position.Winger],
  ["st1", Position.Striker],
  ["st2", Position.Striker],
];
const BENCH: readonly [string, Position][] = [
  ["gk2", Position.Goalkeeper],
  ["cb3", Position.CentreBack],
  ["cm3", Position.CentralMidfielder],
];

function club(overrides: Partial<RosterClub> = {}): RosterClub {
  return {
    clubId: "alpha",
    name: "Alpha FC",
    shortName: "ALP",
    coach: {
      id: "coach-a",
      name: "Coach A",
      age: 50,
      nationality: "BR",
      attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 },
    },
    players: [...XI, ...BENCH].map(([id, pos]) => player(id, pos)),
    ...overrides,
  };
}

function input(overrides: Partial<TeamInput> = {}): TeamInput {
  const xi = XI.map(([id]) => id);
  return {
    clubId: "alpha",
    startingXi: xi,
    bench: BENCH.map(([id]) => id),
    instructions: {
      formation: Formation.F442,
      mentality: Mentality.Balanced,
      tempo: 0.5,
      pressing: 0.5,
      lineHeight: 0.5,
      width: 0.5,
      directness: 0.5,
      markingScheme: MarkingScheme.Zonal,
    },
    roles: Object.fromEntries(XI.map(([id, pos]) => [id, defaultRoleKeyFor(pos)])),
    fieldedPositions: Object.fromEntries(XI),
    coachId: "coach-a",
    ...overrides,
  };
}

/**
 * A role key per position, taken from the enum rather than written as strings — the
 * builder rejects an unknown key on purpose, so hand-written keys in a test would
 * fail for a reason that has nothing to do with what is being tested.
 */
function defaultRoleKeyFor(pos: Position): string {
  return DEFAULT_ROLES[pos];
}

const DEFAULT_ROLES: Record<Position, RoleKey> = {
  [Position.Goalkeeper]: RoleKey.Goalkeeper,
  [Position.CentreBack]: RoleKey.Stopper,
  [Position.FullBack]: RoleKey.DefensiveFullBack,
  [Position.WingBack]: RoleKey.WingBack,
  [Position.DefensiveMidfielder]: RoleKey.BallWinningMidfielder,
  [Position.CentralMidfielder]: RoleKey.BoxToBox,
  [Position.AttackingMidfielder]: RoleKey.AttackingMidfielder,
  [Position.Winger]: RoleKey.Winger,
  [Position.Striker]: RoleKey.Poacher,
};

describe("the canonical Team builder", () => {
  it("builds a team, preserving both submitted orders exactly", () => {
    const team = buildTeam(input(), club());
    // Order is data: the XI's order feeds slot assignment, the bench's is the engine's
    // substitution queue. Neither may be sorted, deduplicated or normalised.
    expect(team.startingXi.map((p) => p.id)).toEqual(XI.map(([id]) => id));
    expect(team.bench.map((p) => p.id)).toEqual(BENCH.map(([id]) => id));
    expect(team.id).toBe("alpha");
    expect(team.coach.id).toBe("coach-a");
  });

  it("is deterministic: the same input twice gives the same team", () => {
    const a = buildTeam(input(), club());
    const b = buildTeam(input(), club());
    expect(a.startingXi.map((p) => p.id)).toEqual(b.startingXi.map((p) => p.id));
    expect(a.startingXi.map((p) => p.overall())).toEqual(b.startingXi.map((p) => p.overall()));
  });

  it("reconstructs keepers as Goalkeeper INSTANCES", () => {
    // The dangerous one, because getting it wrong does not throw. `Team.goalkeeper()`
    // finds the keeper with `instanceof`, and the shot resolver falls back to a
    // mediocre default keeper when there is none — so a Player-with-keeper's-position
    // would silently make every shot in the match easier to score.
    const team = buildTeam(input(), club());
    expect(team.startingXi[0]).toBeInstanceOf(Goalkeeper);
    expect(team.goalkeeper()).toBeDefined();
    expect(team.goalkeeper()!.id).toBe("gk");
    expect(team.bench[0]).toBeInstanceOf(Goalkeeper);
    expect(team.startingXi[1]).not.toBeInstanceOf(Goalkeeper);
  });

  it("refuses an XI with no goalkeeper instead of playing one short of a keeper", () => {
    const xi = ["cb3", ...XI.slice(1).map(([id]) => id)];
    expect(() =>
      buildTeam(
        input({
          startingXi: xi,
          bench: ["gk", "gk2", "cm3"],
          roles: Object.fromEntries(xi.map((id) => [id, RoleKey.Stopper])),
          fieldedPositions: Object.fromEntries(xi.map((id) => [id, Position.CentreBack])),
        }),
        club(),
      ),
    ).toThrow(/no goalkeeper/);
  });

  it("makes no substitutions — an unknown id is an error, never a replacement", () => {
    // The whole separation from the career builder. Deciding who replaces a missing
    // player is a judgement about incomplete information, and two clients judging
    // differently build different elevens from the same record.
    const xi = [...XI.slice(0, 10).map(([id]) => id), "ghost"];
    expect(() =>
      buildTeam(
        input({
          startingXi: xi,
          roles: { ...input().roles, ghost: RoleKey.Poacher },
          fieldedPositions: { ...input().fieldedPositions, ghost: Position.Striker },
        }),
        club(),
      ),
    ).toThrow(TeamBuildError);
  });

  it("rejects a player named twice", () => {
    const xi = [...XI.slice(0, 10).map(([id]) => id), "gk"];
    expect(() => buildTeam(input({ startingXi: xi }), club())).toThrow(/appears twice/);
    // ...including across the two lists, where a duplicate is easiest to miss.
    expect(() => buildTeam(input({ bench: ["gk", "gk2"] }), club())).toThrow(/appears twice/);
  });

  it("rejects an eleven that is not eleven", () => {
    expect(() => buildTeam(input({ startingXi: XI.slice(0, 10).map(([id]) => id) }), club())).toThrow(
      /has 10 players/,
    );
  });

  it("rejects a missing role or fielded position rather than defaulting", () => {
    // A default here would be a decision, and the point is that this function takes
    // none. It also catches a record written by a build that knew a role this one does
    // not, which is a version mismatch worth surfacing.
    const { st2: _dropRole, ...roles } = input().roles;
    expect(() => buildTeam(input({ roles }), club())).toThrow(/no role given for st2/);
    const { st2: _dropPos, ...fieldedPositions } = input().fieldedPositions;
    expect(() => buildTeam(input({ fieldedPositions }), club())).toThrow(
      /no fielded position given for st2/,
    );
    expect(() => buildTeam(input({ roles: { ...input().roles, st2: "notARole" } }), club())).toThrow();
  });

  it("rejects a mismatched club or coach", () => {
    expect(() => buildTeam(input({ clubId: "beta" }), club())).toThrow(/names club beta/);
    expect(() => buildTeam(input({ coachId: "someone-else" }), club())).toThrow(/names coach/);
  });

  it("rejects contradictory goalkeeping attributes", () => {
    const broken = club({
      players: club().players.map((p) =>
        p.id === "cb1" ? { ...p, goalkeeping: { reflexes: 1, handling: 1, positioning: 1, oneOnOnes: 1 } } : p,
      ),
    });
    expect(() => buildTeam(input(), broken)).toThrow(/carries goalkeeping attributes/);

    const keeperless = club({
      players: club().players.map((p) => (p.id === "gk" ? { ...p, goalkeeping: undefined } : p)),
    });
    expect(() => buildTeam(input(), keeperless)).toThrow(/no goalkeeping attributes/);
  });

  it("carries the fielded position through, so out-of-position players are charged for it", () => {
    // A striker fielded at centre-back must be known to be out of position, or the
    // engine cannot apply the debuff and the record understates the lineup's cost.
    const fieldedPositions = { ...input().fieldedPositions, st2: Position.CentreBack };
    const team = buildTeam(input({ fieldedPositions }), club());
    expect(team.tactics.positionFor("st2")).toBe(Position.CentreBack);
    const striker = team.startingXi.find((p) => p.id === "st2")!;
    expect(striker.canPlay(Position.CentreBack)).toBe(false);
    expect(striker.overall(Position.CentreBack)).toBeLessThan(striker.overall());
  });
});
