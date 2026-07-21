import { ATTRIBUTE_MAX, type Player } from "@fut/domain";
import { type MatchState } from "../state/MatchState.js";

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Normalise an attribute (or a weighted sum of attributes) to [0, 1]. All
 * probability formulas are written in these normalised terms, so the underlying
 * attribute scale (1–99) can change without recalibrating the engine.
 */
export function norm(value: number): number {
  return value / ATTRIBUTE_MAX;
}

/**
 * Dead zone: returns 0 while |value| ≤ threshold, then the amount beyond it.
 * Used so that only EXTREME imbalances have an effect, while reasonable values
 * are treated as neutral.
 */
export function deadzone(value: number, threshold: number): number {
  if (value > threshold) return value - threshold;
  if (value < -threshold) return value + threshold;
  return 0;
}

/** Fatigue multiplier for a player: 1 when fresh, lower when tired. */
export function fatigueMultiplier(state: MatchState, player: Player): number {
  const ps = state.playerStates.get(player.id);
  return ps ? 1 - Math.min(0.4, ps.fatigue) : 1;
}

/**
 * An effective attribute value, adjusted for fatigue AND for playing out of
 * position (a small debuff when the player doesn't know the fielded position).
 */
export function eff(state: MatchState, player: Player, value: number): number {
  return value * fatigueMultiplier(state, player) * state.familiarityOf(player.id);
}

/**
 * A contested duel: probability the attacker beats the defender given each
 * side's weighted skill score. Smoothed so extremes never hit 0 or 1.
 */
export function duel(attackScore: number, defendScore: number): number {
  const total = attackScore + defendScore;
  if (total <= 0) return 0.5;
  return clamp(attackScore / total, 0.05, 0.95);
}
