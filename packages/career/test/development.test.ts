import { describe, expect, it } from "vitest";
import { SeededRandom } from "@fut/engine";
import { newPlayerDev, progressSeason, type PlayerDev } from "@fut/career";

/** Overall points a season shifted, as the squad screen would show it. */
function shift(dev: PlayerDev): number {
  return dev.attributeDeltas.passing ?? 0; // a non-physical attribute: no ageing skew on it
}

/** Run `seasons` seasons from a given age and return the total overall shift. */
function ageBy(seasons: number, from: { ca: number; pa: number; age: number }, isGk = false): PlayerDev {
  const dev = newPlayerDev("p", from.ca, from.pa, from.age);
  for (let s = 0; s < seasons; s++) progressSeason(dev, new SeededRandom(1000 + s), isGk);
  return dev;
}

describe("progressSeason (development/aging)", () => {
  it("grows a young high-potential player's ability toward PA", () => {
    const dev = newPlayerDev("p", 100, 170, 18);
    const before = dev.currentAbility;
    progressSeason(dev, new SeededRandom(1), false);
    expect(dev.currentAbility).toBeGreaterThan(before);
    expect(dev.currentAbility).toBeLessThanOrEqual(dev.potentialAbility);
    expect(dev.ageAtSeasonStart).toBe(19);
    // Overall shifts up → positive attribute deltas.
    expect((dev.attributeDeltas.finishing ?? 0)).toBeGreaterThan(0);
  });

  it("declines an old player's ability and legs", () => {
    const dev = newPlayerDev("p", 160, 160, 34);
    const before = dev.currentAbility;
    progressSeason(dev, new SeededRandom(2), false);
    expect(dev.currentAbility).toBeLessThan(before);
    expect((dev.attributeDeltas.pace ?? 0)).toBeLessThan(0);
  });

  it("never grows a young player past PA", () => {
    const dev = newPlayerDev("p", 168, 170, 19);
    for (let i = 0; i < 10; i++) progressSeason(dev, new SeededRandom(i + 1), false);
    expect(dev.currentAbility).toBeLessThanOrEqual(170);
  });

  it("is deterministic for a given seed", () => {
    const a = newPlayerDev("p", 120, 180, 20);
    const b = newPlayerDev("p", 120, 180, 20);
    progressSeason(a, new SeededRandom(7), false);
    progressSeason(b, new SeededRandom(7), false);
    expect(a).toEqual(b);
  });

  /**
   * The reported symptom: "players losing 10 rating from one year to the next". A season
   * is capped in CA, and the rating moves by half of it, so no age and no seed can take
   * more than a few points at once. Swept over every age and many seeds because the old
   * model was fine at 32 and ruinous at 38 — one age would not have caught it.
   */
  it("never takes more than three rating points off anybody in one season", () => {
    let worst = 0;
    for (let age = 18; age <= 44; age++) {
      for (let seed = 1; seed <= 60; seed++) {
        const dev = newPlayerDev("p", 160, 170, age);
        progressSeason(dev, new SeededRandom(seed), false);
        worst = Math.min(worst, dev.attributeDeltas.passing ?? 0);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(-3);
  });

  /**
   * A gentle season is worthless if eight of them still delete the player. The old model
   * turned an 86-rated thirty-year-old into a 40 by the time he was forty; a veteran
   * should get worse, not evaporate.
   */
  it("leaves a veteran a worse player rather than an unusable one", () => {
    const dev = ageBy(10, { ca: 172, pa: 172, age: 30 }); // 86 overall at thirty
    expect(shift(dev)).toBeLessThan(0); // he HAS declined
    expect(shift(dev)).toBeGreaterThan(-15); // but he is still a footballer at forty
  });

  /**
   * No cliff. Improvement used to apply below 24 and stop dead there, so a 24-year-old
   * with thirty points of headroom never touched it again: measured +2.52 rating at 23
   * and +0.30 at 24. The taper has to be monotonic and reach zero on its own.
   */
  it("tapers improvement away with age instead of stopping dead", () => {
    const gainAt = (age: number) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const dev = newPlayerDev("p", 120, 170, age);
        progressSeason(dev, new SeededRandom(seed), false);
        total += dev.currentAbility - 120;
      }
      return total / 40;
    };
    const byAge = [20, 22, 24, 26].map(gainAt);
    // Every step down in improvement, none of them a collapse: a 24-year-old with room
    // still improves at a decent fraction of what he did at 22.
    expect(byAge[0]!).toBeGreaterThan(byAge[1]!);
    expect(byAge[1]!).toBeGreaterThan(byAge[2]!);
    expect(byAge[2]!).toBeGreaterThan(byAge[3]!);
    expect(byAge[2]!).toBeGreaterThan(byAge[1]! * 0.4);
  });

  /** Keepers peak later — the same age costs an outfielder more. */
  it("ages keepers more slowly than outfielders", () => {
    const gk = ageBy(6, { ca: 160, pa: 160, age: 31 }, true);
    const out = ageBy(6, { ca: 160, pa: 160, age: 31 }, false);
    expect(gk.currentAbility).toBeGreaterThan(out.currentAbility);
  });

  /**
   * The odd CA point must not vanish. `round(CA/2)` threw it away, which let a decline of
   * one CA a year — or seven peak seasons of ±1 noise — move a player's ability bar and
   * his market value while his rating never budged.
   */
  it("carries the half point instead of rounding it away", () => {
    const dev = newPlayerDev("p", 100, 100, 20);
    // Force a plateau wobble by leaving no room to grow, then check CA and the displayed
    // shift stay in step to within the half point still in hand.
    for (let s = 0; s < 12; s++) progressSeason(dev, new SeededRandom(s + 1), false);
    const caShift = dev.currentAbility - 100;
    expect(Math.abs(caShift / 2 - shift(dev) - (dev.overallCarry ?? 0))).toBeLessThan(1e-9);
  });
});
