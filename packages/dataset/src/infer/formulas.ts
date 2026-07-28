import { type AttrName, Position } from "@fut/domain";
import { perturb, type Attribute } from "./Attribute.js";
import type { NormalizedPlayer } from "../normalize/Normalize.js";

/**
 * Target overall from a BLEND of two within-position signals: market value
 * (quality proxy) and appearances (how established/trusted a player is). Using
 * value alone over-rated young high-resale prospects and under-rated proven
 * regulars; weighting appearances rewards players who actually feature. Yields
 * a league spread of ~54–86 centred on mid-table quality.
 */
export function targetOverall(valuePct: number, appearancePct = 0): number {
  const quality = 0.5 * valuePct + 0.5 * appearancePct;
  return Math.round(54 + quality * 32);
}

/** Typical BMI for a professional footballer — the neutral point for build. */
const REFERENCE_BMI = 22.5;

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

  // Build (BMI, so it reads height and weight together rather than raw mass —
  // 85 kg means something different at 175 cm than at 195 cm). A deliberate
  // trade-off: mass buys strength and costs agility and pace, both ways.
  if (np.weightKg && np.heightCm) {
    const bmi = np.weightKg / (np.heightCm / 100) ** 2;
    const build = Math.max(-3, Math.min(3, bmi - REFERENCE_BMI));
    set("strength", build * 2.0, 0.55, "community");
    set("agility", -build * 1.6, 0.5, "community");
    set("pace", -build * 1.2, 0.5, "community");
  }

  return out;
}
