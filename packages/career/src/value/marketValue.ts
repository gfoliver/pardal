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

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
