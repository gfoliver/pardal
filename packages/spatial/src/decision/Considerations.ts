import type { RandomSource } from "@fut/engine";
import { TEMPO } from "../config.js";
import { clamp } from "../math.js";

/**
 * Response curves for the utility AI (Dave Mark's Infinite Axis Utility System).
 * Each maps a raw game quantity to a normalised [0, 1] consideration; an
 * action's utility is the PRODUCT of its considerations, so any single
 * near-zero factor vetoes the action.
 */
export const curve = {
  /** Rising linear ramp, clamped. */
  ramp(x: number, lo: number, hi: number): number {
    if (hi === lo) return x >= hi ? 1 : 0;
    return clamp((x - lo) / (hi - lo), 0, 1);
  },
  /** Falling linear ramp, clamped. */
  fall(x: number, lo: number, hi: number): number {
    return 1 - curve.ramp(x, lo, hi);
  },
  /** Logistic S-curve centred at x0 with steepness k. */
  logistic(x: number, x0: number, k: number): number {
    return 1 / (1 + Math.exp(-k * (x - x0)));
  },
} as const;

/**
 * Softmax (Boltzmann) selection over scored options. Keeps choices near-
 * deterministic (small τ favours the best) while allowing variety. Returns the
 * chosen index, drawn from `rng` for reproducibility.
 */
export function softmaxPick(scores: number[], rng: RandomSource, tau = TEMPO.softmaxTau): number {
  if (scores.length === 0) return -1;
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) / tau));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}
