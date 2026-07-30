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
 *
 * Squared, not linear. A plain `a / (a + d)` is a remarkably flat function around
 * parity — near a = d its slope is only ~1/(4a), so at scores around 80 a full
 * rating point moved the duel by 0.3 percentage points and a 12-point difference in
 * defensive quality was worth about 3.5. Duels are one of the very few places in this
 * engine where a defender's ability enters at all, so that flatness was most of the
 * reason a stronger side out-scored a weaker one by far less here than in the spatial
 * engine (measured: 0.68 points per match gained across an 18-rating gap against
 * spatial's 1.19).
 *
 * Squaring doubles the slope at parity while keeping the function's shape — still
 * symmetric, still 0.5 at parity, still bounded — and needs no exponent operator, so
 * it stays inside the portability rules (see `math.ts` in @fut/spatial).
 */
export function duel(attackScore: number, defendScore: number): number {
  const a = attackScore * attackScore;
  const d = defendScore * defendScore;
  const total = a + d;
  if (total <= 0) return 0.5;
  return clamp(a / total, 0.05, 0.95);
}
