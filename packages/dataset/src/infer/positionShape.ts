import { type AttrName, Position, WEIGHTS } from "@fut/domain";
import { attr, type Attribute } from "./Attribute.js";

/**
 * The 24 outfield + 4 goalkeeping attribute keys as they appear in the flat
 * `WEIGHTS` space (gk positioning is `gkPositioning` there to disambiguate from
 * the mental `positioning`).
 */
export const ALL_ATTRS: readonly AttrName[] = [
  "pace", "stamina", "strength", "agility",
  "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision", "offTheBall",
  "passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing", "firstTouch", "heading",
  "reflexes", "handling", "gkPositioning", "oneOnOnes",
];

/** Fraction of the target a non-defining (unweighted) attribute sits at. */
const BASELINE_RATIO = 0.75;

/**
 * Shape a full attribute vector for a position at a target overall. Attributes
 * the position is rated on (its `WEIGHTS`) sit at the target — so
 * `positionOverall ≈ target` by construction — and the rest sit at a lower
 * baseline. Defining attrs are provenance `community` (anchored by market
 * value); the baseline rest are `manual` (position prior, low confidence).
 * Goalkeeping keys only carry real confidence for keepers.
 *
 * `offTheBall`, `firstTouch` and `heading` land in the baseline branch, because "defining" is read off
 * `WEIGHTS` and they carry no weight yet. That is the intended shape of the first half of this work: the
 * three exist and are populated for every player, and no position's overall can move. It also means the
 * second half is a `WEIGHTS`-only change — the moment a position weights one of them, this function
 * starts treating it as defining without being told twice.
 */
export function shapeForPosition(position: Position, target: number): Record<AttrName, Attribute> {
  const weights = WEIGHTS[position];
  const isKeeper = position === Position.Goalkeeper;
  const out = {} as Record<AttrName, Attribute>;
  for (const key of ALL_ATTRS) {
    const defining = weights[key] !== undefined;
    const isGkKey = key === "reflexes" || key === "handling" || key === "gkPositioning" || key === "oneOnOnes";
    if (defining) {
      out[key] = attr(target, 0.6, "community");
    } else if (isGkKey) {
      // Outfielders get a low fixed gk floor; keepers' gk keys are set via WEIGHTS above.
      out[key] = attr(isKeeper ? target : 8, isKeeper ? 0.6 : 0.9, "prior");
    } else {
      out[key] = attr(target * BASELINE_RATIO, 0.35, "prior");
    }
  }
  return out;
}
