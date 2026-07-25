import type { Money } from "../time.js";

export interface MarketValueInput {
  /** Position overall on the 1–99 scale (e.g. from positionOverall). */
  readonly overall: number;
  readonly age: number;
  readonly currentAbility: number; // 0..200
  readonly potentialAbility: number; // 0..200
}

/**
 * Age multiplier on value: rises to a peak in the mid-20s, then declines. A
 * high-potential youngster's premium comes from the potential term, not here.
 */
export function ageCurve(age: number): number {
  if (age <= 27) return clamp(0.6 + (age - 16) * 0.04, 0.55, 1.0); // 16→0.6 … 26→1.0
  return clamp(1.0 - (age - 27) * 0.09, 0.15, 1.0); // 28→0.91 … 36→0.19
}

/** Premium for unfulfilled potential (room left to grow). */
export function potentialMultiplier(currentAbility: number, potentialAbility: number): number {
  const gap = Math.max(0, potentialAbility - currentAbility);
  return 1 + (gap / 200) * 1.5;
}

/**
 * Deterministic market value (integer currency units). Monotonic in `overall`
 * with everything else fixed. Pure — no stored field, recompute anywhere to
 * avoid drift.
 */
export function marketValue(input: MarketValueInput): Money {
  const base = Math.round(input.overall ** 3 * 4); // ~2M at overall 80
  const value = base * ageCurve(input.age) * potentialMultiplier(input.currentAbility, input.potentialAbility);
  return Math.round(value);
}

/**
 * Drift a REAL dataset market value as the player ages and develops, so season 0
 * shows exactly the source value (ratios = 1) and later seasons evolve with the
 * player. `baseAge`/`baseOverall` are the dataset's own figures.
 */
export function anchoredValue(anchor: Money, base: { age: number; overall: number }, now: { age: number; overall: number }): Money {
  const ageRatio = ageCurve(now.age) / Math.max(0.01, ageCurve(base.age));
  const formRatio = base.overall > 0 ? (now.overall / base.overall) ** 2 : 1;
  return Math.max(0, Math.round(anchor * ageRatio * formRatio));
}

/** Soft cap so no single wage runs away from the league's scale. */
const WAGE_CAP = 1_600_000;

/**
 * MONTHLY wage from a player's market value, fitted to the Brasileirão's real
 * scale: league mean ≈ R$400k/month, stars R$1–1.5M (anchored at
 * value R$235M → R$1.5M and value R$9M → R$350k). Sub-linear on purpose — a
 * player's wage grows far slower than their transfer value.
 */
export function monthlyWage(value: Money): Money {
  if (value <= 0) return 60_000;
  return Math.min(WAGE_CAP, Math.round(256 * value ** 0.45));
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
