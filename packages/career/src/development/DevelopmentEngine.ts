import type { SeededRandom } from "@fut/engine";
import type { AttrName, PlayerDev } from "./PlayerDev.js";

const OUTFIELD_ATTRS: AttrName[] = [
  "pace", "stamina", "strength", "agility",
  "decisions", "composure", "workRate", "teamwork", "aggression", "anticipation", "positioning", "vision",
  "passing", "technique", "dribbling", "finishing", "shotPower", "tackling", "marking", "crossing",
];
const PHYSICAL_ATTRS: AttrName[] = ["pace", "stamina", "strength", "agility"];
const GK_ATTRS: AttrName[] = ["reflexes", "handling", "gkPositioning", "oneOnOnes"];

/**
 * The age curve, in CA points (0..200). Every figure here is worth HALF as much on the
 * squad screen, because a season's rating change is `round(CA change / 2)`.
 *
 * The shape it replaces had two problems, both measured on a real Brasileirão squad over
 * ten seasons (`npm run career:progression`):
 *
 *  - **A cliff at 24.** Improvement toward potential applied below 24 and stopped dead:
 *    mean +2.52 rating at 23, +0.30 at 24. A twenty-four-year-old with thirty points of
 *    headroom never touched it again.
 *  - **A decline that erased careers.** `-(age - 30) * (1 + rng*2)` grows quadratically
 *    once summed over a career: a 36-year-old lost up to 10 rating in ONE season (the
 *    reported symptom), 23% of all seasons lost 5+, and an 86-rated thirty-year-old was a
 *    40 by the time he was forty. He was unplayable years before anyone would sell him.
 *
 * So: growth tapers to nothing instead of cliffing, and decline is linear in age with a
 * per-season cap, which keeps a veteran a worse player without deleting him.
 */

/** Below this age a player improves at the full rate; above it the rate tapers. */
const GROWTH_FULL_AGE = 18;
/** Up to this age, a season of improvement also adds a yard of pace. */
const PHYSICAL_PRIME_AGE = 24;
/** Improvement toward potential has faded to nothing here. */
const GROWTH_END_AGE = 27;
/** The last season before decline begins. */
const PEAK_END_AGE = 31;
/**
 * Keepers grow and peak later — they genuinely play at the top into their late thirties,
 * and the position leans on the attributes that age slowest.
 */
const KEEPER_LONGEVITY = 3;

/** Share of the remaining gap to potential closed in one season, at full rate. */
const GROWTH_BASE = 0.14;
const GROWTH_SPREAD = 0.2;

/** CA lost in the first season past the peak, and the extra lost per further year. */
const DECLINE_FIRST_YEAR = 0.8;
const DECLINE_ACCELERATION = 0.32;
/**
 * No single season may take more than this, however old the player is.
 *
 * This is the guard that answers the complaint directly: at five CA it is 2-3 rating
 * points, so a veteran gets visibly worse without a year ever gutting him.
 */
const DECLINE_CAP = 5;
/** Multiplicative spread on a season's decline, so ±this around 1.0. */
const DECLINE_NOISE = 0.4;

/**
 * Progress one player's development for a season (mutates `dev`). CA climbs toward the
 * hidden PA while young — fastest as a teenager, fading to nothing by the late twenties —
 * holds through the peak, then declines, physical attributes decaying faster than mental.
 *
 * The CA change is projected onto attribute deltas (overall ≈ CA/2) with the odd half
 * point carried in `dev.overallCarry`, so nothing is silently rounded away. Deterministic
 * given the seeded rng.
 */
export function progressSeason(dev: PlayerDev, rng: SeededRandom, isGk: boolean): void {
  const age = dev.ageAtSeasonStart;
  const growthEnd = GROWTH_END_AGE + (isGk ? KEEPER_LONGEVITY : 0);
  const peakEnd = PEAK_END_AGE + (isGk ? KEEPER_LONGEVITY : 0);

  let gain: number;
  if (age <= peakEnd) {
    // Growth and plateau are ONE branch, which is what removes the cliff: the taper
    // reaches zero on its own, so there is no age at which the rules change under a
    // player. A man already at his ceiling just wobbles.
    const taper = Math.max(0, (growthEnd - age) / (growthEnd - GROWTH_FULL_AGE));
    const room = dev.potentialAbility - dev.currentAbility;
    const growth = Math.round(room * (GROWTH_BASE + rng.next() * GROWTH_SPREAD) * taper);
    gain = growth > 0 ? growth : rng.int(3) - 1;
  } else {
    const yearsPast = age - peakEnd;
    const perSeason =
      (DECLINE_FIRST_YEAR + yearsPast * DECLINE_ACCELERATION) * (1 - DECLINE_NOISE + rng.next() * DECLINE_NOISE * 2);
    gain = -Math.min(DECLINE_CAP, Math.round(perSeason));
  }

  const nextCa = clamp(dev.currentAbility + gain, 20, dev.potentialAbility);
  const applied = nextCa - dev.currentAbility; // may differ from `gain` after clamp
  dev.currentAbility = nextCa;

  // Overall points to shift, with the previous season's unspent fraction folded in.
  const wanted = applied / 2 + (dev.overallCarry ?? 0);
  const ovDelta = Math.round(wanted);
  dev.overallCarry = wanted - ovDelta;

  if (ovDelta !== 0) {
    const attrs = isGk ? [...OUTFIELD_ATTRS.filter((a) => !PHYSICAL_ATTRS.includes(a)), ...GK_ATTRS] : OUTFIELD_ATTRS;
    for (const a of attrs) bump(dev, a, ovDelta);
    // Ageing skew: decline hits the legs harder; youth grows them a touch more.
    // Tied to AGE, not merely to a negative shift — a peak player who happens to wobble
    // down has not lost a yard of pace, and charging him one every time made the plateau
    // a slow one-way bleed.
    if (ovDelta < 0 && age > peakEnd) for (const a of PHYSICAL_ATTRS) bump(dev, a, -1);
    else if (ovDelta > 0 && age < PHYSICAL_PRIME_AGE) for (const a of PHYSICAL_ATTRS) bump(dev, a, 1);
  }

  dev.ageAtSeasonStart = age + 1;
}

function bump(dev: PlayerDev, attr: AttrName, by: number): void {
  dev.attributeDeltas[attr] = (dev.attributeDeltas[attr] ?? 0) + by;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
