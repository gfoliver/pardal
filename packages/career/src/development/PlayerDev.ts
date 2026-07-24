import type { SeasonDate } from "../time.js";

/** Attribute names that development can nudge (mirror of overall.ts flatten). */
export type AttrName =
  | "pace" | "stamina" | "strength" | "agility"
  | "decisions" | "composure" | "workRate" | "teamwork" | "aggression"
  | "anticipation" | "positioning" | "vision"
  | "passing" | "technique" | "dribbling" | "finishing" | "shotPower"
  | "tackling" | "marking" | "crossing"
  | "reflexes" | "handling" | "gkPositioning" | "oneOnOnes";

export interface Injury {
  readonly type: string;
  /** Player is unavailable until (and including) this date passes. */
  readonly outUntil: SeasonDate;
}

export interface Suspension {
  readonly gamesLeft: number;
  readonly competitionId: string;
}

/**
 * All season-MUTABLE state for a player, keyed by playerId. The base
 * `domain.Player` stays immutable; the career layer applies `attributeDeltas`
 * (and drops injured/suspended players) when building a match-time Team.
 *
 * Ability model: CA (currentAbility) drives the effective attribute level and
 * grows toward the hidden PA (potentialAbility) ceiling while young, declining
 * with age. Both on a 0..200 scale, fixed-seed deterministic.
 */
export interface PlayerDev {
  readonly playerId: string;
  currentAbility: number; // 0..200
  readonly potentialAbility: number; // 0..200, hidden ceiling
  /** Per-attribute deltas vs the base player, applied at match build time. */
  attributeDeltas: Partial<Record<AttrName, number>>;
  /** Match sharpness / fatigue carryover, 0..100. */
  fitness: number;
  injury?: Injury;
  suspension?: Suspension;
  /** competitionId -> yellows accumulated toward a ban. */
  yellowAccumulation: Record<string, number>;
  ageAtSeasonStart: number;
}

/** A fresh dev record for a newly-created player. */
export function newPlayerDev(playerId: string, ca: number, pa: number, age: number): PlayerDev {
  return {
    playerId,
    currentAbility: ca,
    potentialAbility: pa,
    attributeDeltas: {},
    fitness: 100,
    yellowAccumulation: {},
    ageAtSeasonStart: age,
  };
}

/** Whether the player can feature on `date` (not injured, not suspended). */
export function isAvailable(dev: PlayerDev, injuredOnly = false): boolean {
  if (dev.injury) return false;
  if (!injuredOnly && dev.suspension && dev.suspension.gamesLeft > 0) return false;
  return true;
}
