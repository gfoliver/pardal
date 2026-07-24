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
 * Progress one player's development for a season (mutates `dev`). CA moves
 * toward PA while young, holds through the peak, and declines after 30 —
 * physical attributes decaying faster than mental. The CA change is projected
 * onto attribute deltas (overall ≈ CA/2), so an added `x` to every attribute
 * shifts the effective overall by ~x. Deterministic given the seeded rng.
 */
export function progressSeason(dev: PlayerDev, rng: SeededRandom, isGk: boolean): void {
  const age = dev.ageAtSeasonStart;
  let gain: number;
  if (age < 24) {
    gain = Math.round((dev.potentialAbility - dev.currentAbility) * (0.12 + rng.next() * 0.18));
  } else if (age <= 30) {
    gain = rng.int(3) - 1; // -1..+1 plateau noise
  } else {
    gain = -Math.round((age - 30) * (1 + rng.next() * 2)); // accelerating decline
  }

  const nextCa = clamp(dev.currentAbility + gain, 20, dev.potentialAbility);
  const applied = nextCa - dev.currentAbility; // may differ from `gain` after clamp
  dev.currentAbility = nextCa;

  const ovDelta = Math.round(applied / 2); // overall points to shift
  if (ovDelta !== 0) {
    const attrs = isGk ? [...OUTFIELD_ATTRS.filter((a) => !PHYSICAL_ATTRS.includes(a)), ...GK_ATTRS] : OUTFIELD_ATTRS;
    for (const a of attrs) bump(dev, a, ovDelta);
    // Aging skew: decline hits the legs harder; youth grows them a touch more.
    if (applied < 0) for (const a of PHYSICAL_ATTRS) bump(dev, a, -1);
    else if (applied > 0 && age < 24) for (const a of PHYSICAL_ATTRS) bump(dev, a, 1);
  }

  dev.ageAtSeasonStart = age + 1;
}

function bump(dev: PlayerDev, attr: AttrName, by: number): void {
  dev.attributeDeltas[attr] = (dev.attributeDeltas[attr] ?? 0) + by;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
