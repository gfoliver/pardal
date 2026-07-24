import { type AttrName, Position } from "@fut/domain";
import { perturb, type Attribute } from "./Attribute.js";
import type { NormalizedPlayer } from "../normalize/Normalize.js";

/**
 * Market value is the best free proxy for quality, so the target overall is a
 * (linear) function of the player's within-position market-value percentile.
 * Yields a league spread of ~56–88 with the mean around mid-table quality.
 */
export function targetOverall(valuePct: number): number {
  return Math.round(56 + valuePct * 32);
}

const ATTACKING = new Set<Position>([Position.Striker, Position.Winger, Position.AttackingMidfielder]);
const WIDE = new Set<Position>([Position.Winger, Position.WingBack, Position.FullBack]);

/**
 * Nudge specific shaped attributes from the basic stats + bio we actually have.
 * Each touched attribute is re-sourced (`stats` for production, `community` for
 * bio) with higher confidence; everything untouched keeps its shape provenance.
 * Pure and deterministic.
 */
export function applyPerturbations(flat: Record<AttrName, Attribute>, np: NormalizedPlayer): Record<AttrName, Attribute> {
  const out = { ...flat };
  const set = (k: AttrName, delta: number, conf: number, source: Parameters<typeof perturb>[3] = "stats") => {
    out[k] = perturb(out[k]!, delta, conf, source);
  };

  // Production
  const attackScale = ATTACKING.has(np.position) ? 1 : 0.4;
  set("finishing", np.per90.goals * 14 * attackScale, 0.7);
  set("composure", np.per90.goals * 6 * attackScale, 0.6);
  set("vision", np.per90.assists * 12, 0.7);
  set("passing", np.per90.assists * 8, 0.65);
  if (WIDE.has(np.position)) set("crossing", np.per90.assists * 8, 0.65);
  set("aggression", np.per90.cards * 40, 0.7);

  // Playing time → fitness/stamina
  set("stamina", (np.minutesShare - 0.5) * 10, 0.6);

  // Age curve
  if (np.ageYears > 29) {
    set("pace", -(np.ageYears - 29) * 1.2, 0.6, "community");
    set("stamina", -(np.ageYears - 29) * 1.0, 0.6, "community");
  } else if (np.ageYears < 21) {
    set("strength", -(21 - np.ageYears) * 1.5, 0.6, "community");
  }

  // Height → strength / aerial (marking) or agility
  if (np.heightCm && np.heightCm > 188) {
    set("strength", (np.heightCm - 188) * 0.6, 0.6, "community");
    set("marking", (np.heightCm - 188) * 0.4, 0.5, "community");
  } else if (np.heightCm && np.heightCm < 172) {
    set("agility", (172 - np.heightCm) * 0.3, 0.55, "community");
  }

  return out;
}
