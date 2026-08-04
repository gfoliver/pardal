/**
 * Deterministic sub-seed derivation for the career world. Every stochastic
 * subsystem draws a seed from the single `careerSeed` + a stable context so the
 * whole career is reproducible (and server-auditable) from that one number.
 *
 * All helpers return a uint32. Portable (no platform-specific hashing).
 */

/** FNV-1a hash of a string → uint32. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix a base seed with a numeric salt (uint32). */
function mix(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Per-competition season seed (feeds matchSeed for its fixtures). */
export function competitionSeed(careerSeed: number, season: number, competitionId: string): number {
  return mix(mix(careerSeed, season * 2654435761), hashString(competitionId));
}

/** Per-player, per-season development seed. */
export function devSeed(careerSeed: number, season: number, playerId: string): number {
  return mix(mix(careerSeed, season * 40503), hashString(playerId));
}

/**
 * Seed for a season's AI renewal decisions.
 *
 * One stream per SEASON rather than per player, so the coin every club tosses comes off the same
 * sequence — the alternative (a seed per player) would let one club's outcome depend on how many
 * contracts happened to be evaluated before it.
 */
export function renewalSeed(careerSeed: number, season: number): number {
  return mix(mix(careerSeed, season * 2246822519), hashString("renewal"));
}

/** Per-window transfer-tick seed. */
export function transferSeed(careerSeed: number, season: number, tick: number): number {
  return mix(mix(careerSeed, season * 19349663), tick * 83492791);
}

/**
 * Seed for a scout's misjudgement of ONE fact about one player.
 *
 * Deliberately independent of time: the error a scout makes about a player's
 * finishing is a property of that scout-and-player, not of when you looked. That
 * is what lets an estimate NARROW as confidence grows instead of jittering on
 * every render — same seed, smaller margin, same direction of error.
 */
export function scoutSeed(careerSeed: number, playerId: string, fact: string): number {
  return mix(mix(careerSeed, hashString(playerId)), hashString(fact));
}
