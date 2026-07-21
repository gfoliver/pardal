/**
 * Shared football vocabulary used across the domain (and interpreted by the
 * engine). Kept here so both `Role` weights and engine resolvers reference the
 * same action/position names without duplicating string literals.
 */

/** Coarse grouping used by logic that only needs the broad line. */
export enum PositionGroup {
  Goalkeeper = "GK",
  Defence = "DEF",
  Midfield = "MID",
  Attack = "FWD",
}

/** Detailed on-pitch position. */
export enum Position {
  Goalkeeper = "goalkeeper", // goleiro
  CentreBack = "centreBack", // zagueiro
  FullBack = "fullBack", // lateral
  WingBack = "wingBack", // ala
  DefensiveMidfielder = "defensiveMidfielder", // volante
  CentralMidfielder = "centralMidfielder", // meio-campista
  AttackingMidfielder = "attackingMidfielder", // meia-armador
  Winger = "winger", // ponta
  Striker = "striker", // atacante
}

interface PositionMeta {
  readonly group: PositionGroup;
  /** Base pitch advancement (0 = own goal … 1 = attacking end). */
  readonly advancement: number;
  /** Whether the position naturally stays wide. */
  readonly wide: boolean;
}

const POSITION_META: Record<Position, PositionMeta> = {
  [Position.Goalkeeper]: { group: PositionGroup.Goalkeeper, advancement: 0.02, wide: false },
  [Position.CentreBack]: { group: PositionGroup.Defence, advancement: 0.16, wide: false },
  [Position.FullBack]: { group: PositionGroup.Defence, advancement: 0.2, wide: true },
  [Position.WingBack]: { group: PositionGroup.Defence, advancement: 0.3, wide: true },
  [Position.DefensiveMidfielder]: { group: PositionGroup.Midfield, advancement: 0.38, wide: false },
  [Position.CentralMidfielder]: { group: PositionGroup.Midfield, advancement: 0.5, wide: false },
  [Position.AttackingMidfielder]: { group: PositionGroup.Midfield, advancement: 0.66, wide: false },
  [Position.Winger]: { group: PositionGroup.Attack, advancement: 0.72, wide: true },
  [Position.Striker]: { group: PositionGroup.Attack, advancement: 0.82, wide: false },
};

export function positionGroup(position: Position): PositionGroup {
  return POSITION_META[position].group;
}

export function positionAdvancement(position: Position): number {
  return POSITION_META[position].advancement;
}

export function positionIsWide(position: Position): boolean {
  return POSITION_META[position].wide;
}

export function isGoalkeeperPosition(position: Position): boolean {
  return position === Position.Goalkeeper;
}

/** On-ball actions a ball carrier can choose. */
export enum OnBallAction {
  Pass = "pass",
  Dribble = "dribble",
  Shoot = "shoot",
  Cross = "cross",
  HoldUp = "holdUp",
  Clear = "clear",
  PassBack = "passBack",
}

/** Team mentality — biases the whole side towards risk or safety. */
export enum Mentality {
  VeryDefensive = "veryDefensive",
  Defensive = "defensive",
  Balanced = "balanced",
  Attacking = "attacking",
  VeryAttacking = "veryAttacking",
}

/** How defenders are assigned to opponents. */
export enum MarkingScheme {
  Zonal = "zonal",
  Man = "man",
}

/** Maps a mentality to a numeric attacking bias in the range [-1, 1]. */
export function mentalityToAttackBias(mentality: Mentality): number {
  switch (mentality) {
    case Mentality.VeryDefensive:
      return -1;
    case Mentality.Defensive:
      return -0.5;
    case Mentality.Balanced:
      return 0;
    case Mentality.Attacking:
      return 0.5;
    case Mentality.VeryAttacking:
      return 1;
  }
}
