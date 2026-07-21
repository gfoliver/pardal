/**
 * Player and coach attributes. All ratings use the familiar 1–20 scale.
 * These are plain value objects (data), read by the engine's resolvers.
 */

export interface PhysicalAttributes {
  readonly pace: number;
  readonly stamina: number;
  readonly strength: number;
  readonly agility: number;
}

export interface MentalAttributes {
  readonly decisions: number;
  readonly composure: number;
  readonly workRate: number;
  readonly teamwork: number;
  readonly aggression: number;
  readonly anticipation: number;
  readonly positioning: number;
  readonly vision: number;
}

export interface TechnicalAttributes {
  readonly passing: number;
  readonly technique: number;
  readonly dribbling: number;
  readonly finishing: number;
  readonly shotPower: number;
  readonly tackling: number;
  readonly marking: number;
  readonly crossing: number;
}

export interface GoalkeepingAttributes {
  readonly reflexes: number;
  readonly handling: number;
  readonly positioning: number;
  readonly oneOnOnes: number;
}

/** Coach attributes are purely tactical (no motivation/morale, by design). */
export interface CoachAttributes {
  /** Willingness to change the tactic (wedded to it ↔ flexible). */
  readonly adaptability: number;
  /** Quality of tactic/substitution choices. */
  readonly tacticalKnowledge: number;
  /** How early the coach reacts to context (scoreline, fatigue, red cards). */
  readonly reactiveness: number;
  /** Composure in decisive moments. */
  readonly composure: number;
}

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 99;

/** Clamp an arbitrary number into the valid attribute range. */
export function clampAttribute(value: number): number {
  if (value < ATTRIBUTE_MIN) return ATTRIBUTE_MIN;
  if (value > ATTRIBUTE_MAX) return ATTRIBUTE_MAX;
  return value;
}
