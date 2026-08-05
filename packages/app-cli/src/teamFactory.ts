import {
  clampAttribute,
  Coach,
  type CoachAttributes,
  DefaultRoleProvider,
  Formation,
  getFormationTemplate,
  getRole,
  Goalkeeper,
  type GoalkeepingAttributes,
  MarkingScheme,
  Mentality,
  type MentalAttributes,
  type PhysicalAttributes,
  Player,
  Position,
  PositionGroup,
  positionGroup,
  positionIsWide,
  type Role,
  type RoleKey,
  Tactics,
  TacticsBuilder,
  type TeamInstructions,
  type TechnicalAttributes,
  Team,
} from "@fut/domain";

function physical(v: number): PhysicalAttributes {
  return { pace: v, stamina: v, strength: v, agility: v };
}

function mental(v: number): MentalAttributes {
  return {
    decisions: v,
    composure: v,
    workRate: v,
    teamwork: v,
    aggression: v,
    anticipation: v,
    positioning: v,
    vision: v,
    offTheBall: v,
  };
}

function technical(v: number, overrides: Partial<TechnicalAttributes> = {}): TechnicalAttributes {
  return {
    passing: v,
    technique: v,
    dribbling: v,
    finishing: v,
    shotPower: v,
    tackling: v,
    marking: v,
    crossing: v,
    firstTouch: v,
    heading: v,
    ...overrides,
  };
}

function goalkeeping(v: number): GoalkeepingAttributes {
  return { reflexes: v, handling: v, positioning: v, oneOnOnes: v };
}

function bump(v: number, delta: number): number {
  return clampAttribute(v + delta);
}

/** Attribute tweaks so each position plays to type. */
function outfield(
  id: string,
  name: string,
  position: Position,
  v: number,
): Player {
  const group = positionGroup(position);
  let tech = technical(v);
  if (position === Position.Striker) {
    tech = technical(v, { finishing: bump(v, 12), dribbling: bump(v, 4) });
  } else if (position === Position.Winger) {
    // Wingers excel at dribbling/crossing, not finishing.
    tech = technical(v, { dribbling: bump(v, 8), crossing: bump(v, 12), finishing: bump(v, 3) });
  } else if (group === PositionGroup.Attack) {
    tech = technical(v, { finishing: bump(v, 8), dribbling: bump(v, 5) });
  } else if (group === PositionGroup.Defence) {
    tech = technical(v, { tackling: bump(v, 10), marking: bump(v, 10) });
    if (positionIsWide(position)) tech = { ...tech, crossing: bump(v, 8) };
  } else if (group === PositionGroup.Midfield) {
    tech = technical(v, { passing: bump(v, 10) });
  }
  return new Player({
    id,
    name,
    age: 25,
    nationality: "BR",
    position,
    physical: physical(v),
    mental: mental(v),
    technical: tech,
  });
}

function keeper(id: string, name: string, v: number): Goalkeeper {
  return new Goalkeeper({
    id,
    name,
    age: 27,
    nationality: "BR",
    physical: physical(v),
    mental: mental(v),
    technical: technical(v),
    goalkeeping: goalkeeping(v),
  });
}

export interface BuildTeamOptions {
  id: string;
  name: string;
  shortName: string;
  /** Base attribute rating (1–99) applied to every player. */
  rating: number;
  coachAttributes?: CoachAttributes;
  mentality?: Mentality;
  /** Optional: build the squad in a specific formation (defaults to 4-4-2). */
  formation?: Formation;
  /** Optional: assign a specific role to every forward (for behaviour tests). */
  forwardRole?: RoleKey;
  /** Optional: override the role for every player of a given position. */
  roleByPosition?: Partial<Record<Position, RoleKey>>;
  /** Optional: override team instructions (tempo, pressing, width, …). */
  instructions?: Partial<TeamInstructions>;
}

const POSITION_LABEL: Record<Position, string> = {
  [Position.Goalkeeper]: "GK",
  [Position.CentreBack]: "CB",
  [Position.FullBack]: "FB",
  [Position.WingBack]: "WB",
  [Position.DefensiveMidfielder]: "DM",
  [Position.CentralMidfielder]: "CM",
  [Position.AttackingMidfielder]: "AM",
  [Position.Winger]: "WG",
  [Position.Striker]: "ST",
};

/** Build the 11 starters from a formation's template (one player per slot). */
function buildStarters(id: string, s: string, rating: number, formation: Formation): Player[] {
  const seen: Partial<Record<Position, number>> = {};
  return getFormationTemplate(formation).map((slot, i) => {
    const label = POSITION_LABEL[slot.position];
    const count = (seen[slot.position] = (seen[slot.position] ?? 0) + 1);
    const name = `${s} ${label}${count}`;
    const pid = `${id}-p${i}`;
    return slot.position === Position.Goalkeeper
      ? keeper(pid, name, rating)
      : outfield(pid, name, slot.position, rating);
  });
}

/**
 * Builds a complete, deterministic fictional team in a 4-4-2 with detailed
 * positions (full-backs, centre-backs, wingers, central midfielders, strikers),
 * a coach and simple-mode tactics. Reused by the CLI runner and the tests.
 */
export function buildTeam(options: BuildTeamOptions): Team {
  const { id, name, shortName, rating } = options;
  const s = shortName;
  const formation = options.formation ?? Formation.F442;
  const starters: Player[] = buildStarters(id, s, rating, formation);
  const bench: Player[] = [
    keeper(`${id}-gk2`, `${s} Keeper 2`, rating),
    outfield(`${id}-cb3`, `${s} Centre Back 3`, Position.CentreBack, rating),
    outfield(`${id}-dm`, `${s} Defensive Mid`, Position.DefensiveMidfielder, rating),
    outfield(`${id}-am`, `${s} Attacking Mid`, Position.AttackingMidfielder, rating),
    outfield(`${id}-st3`, `${s} Striker 3`, Position.Striker, rating),
  ];

  const coachAttributes: CoachAttributes = options.coachAttributes ?? {
    adaptability: 60,
    tacticalKnowledge: 60,
    reactiveness: 60,
    composure: 60,
  };
  const coach = new Coach({
    id: `${id}-coach`,
    name: `${s} Coach`,
    age: 50,
    nationality: "BR",
    attributes: coachAttributes,
  });

  let tactics = new TacticsBuilder().simple(starters, {
    formation,
    mentality: options.mentality ?? Mentality.Balanced,
  });
  if (options.forwardRole) {
    const role = getRole(options.forwardRole);
    for (const player of starters) {
      if (positionGroup(player.position) === PositionGroup.Attack) {
        tactics = tactics.withRole(player.id, role);
      }
    }
  }
  if (options.roleByPosition) {
    for (const player of starters) {
      const key = options.roleByPosition[player.position];
      if (key) tactics = tactics.withRole(player.id, getRole(key));
    }
  }
  if (options.instructions) {
    tactics = tactics.withInstructions(options.instructions);
  }

  return new Team({ id, name, shortName, coach, startingXi: starters, bench, tactics });
}

export interface CustomSlot {
  position: Position;
  depth: number;
  width: number;
}

/**
 * Build a team from an ARBITRARY slot layout (bypassing the formation enum) —
 * for experimenting with unusual shapes users might try (e.g. 5-0-5, 5-5-0).
 */
export function buildCustomTeam(options: {
  id: string;
  name: string;
  shortName: string;
  rating: number;
  slots: readonly CustomSlot[];
}): Team {
  const { id, name, shortName: s, rating } = options;
  const roleProvider = new DefaultRoleProvider();
  const seen: Partial<Record<Position, number>> = {};
  const starters: Player[] = options.slots.map((slot, i) => {
    const count = (seen[slot.position] = (seen[slot.position] ?? 0) + 1);
    const label = `${s} ${slot.position}${count}`;
    const pid = `${id}-p${i}`;
    return slot.position === Position.Goalkeeper
      ? keeper(pid, label, rating)
      : outfield(pid, label, slot.position, rating);
  });
  const bench: Player[] = [
    keeper(`${id}-b1`, `${s} GK2`, rating),
    outfield(`${id}-b2`, `${s} CB`, Position.CentreBack, rating),
    outfield(`${id}-b3`, `${s} MF`, Position.CentralMidfielder, rating),
    outfield(`${id}-b4`, `${s} FW`, Position.Striker, rating),
    outfield(`${id}-b5`, `${s} MF2`, Position.CentralMidfielder, rating),
  ];

  const roles = new Map<string, Role>();
  const positions = new Map<string, Position>();
  const slots = new Map<string, { depth: number; width: number }>();
  starters.forEach((p, i) => {
    roles.set(p.id, roleProvider.defaultRoleFor(p.position));
    positions.set(p.id, p.position);
    slots.set(p.id, { depth: options.slots[i]!.depth, width: options.slots[i]!.width });
  });

  const instructions: TeamInstructions = {
    formation: Formation.F442, // label only; the slots define the real shape
    mentality: Mentality.Balanced,
    tempo: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, directness: 0.5,
    markingScheme: MarkingScheme.Zonal,
  };
  const tactics = new Tactics(instructions, roles, positions, slots);
  const coach = new Coach({
    id: `${id}-coach`, name: `${s} Coach`, age: 50, nationality: "BR",
    attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 },
  });
  return new Team({ id, name, shortName: s, coach, startingXi: starters, bench, tactics });
}

/** A convenient default matchup: two evenly-matched fictional teams. */
export function defaultMatchup(): { home: Team; away: Team } {
  return {
    home: buildTeam({ id: "home", name: "Rio Athletic", shortName: "RIO", rating: 65 }),
    away: buildTeam({ id: "away", name: "São Paulo United", shortName: "SPU", rating: 65 }),
  };
}
