import { describe, expect, it } from "vitest";
import {
  alignToStatedOverall,
  applyTransform,
  attributeValues,
  calibrate,
  distributionOf,
  IDENTITY,
  toAttributes,
  unratedTarget,
  type PesRatings,
} from "../src/index.js";

/**
 * Importing a foreign rating scale.
 *
 * We ADOPT the source's scale: its judgement of how good a player is beats the
 * market-value inference it replaces. So the properties that matter are that a
 * player's SHAPE survives the import (quick but can't pass stays that way), and
 * that our own overall ends up agreeing with the source's stated one — our
 * blends measured ~7 points generous on the weakest players, which would have
 * compressed the league in exactly the wrong direction.
 *
 * The rescaling machinery (`calibrate`) is still here, but its job is now the
 * BACKFILL: placing the ~31% of players the source doesn't cover onto the rated
 * population's distribution, a touch below its centre.
 */

const strong: PesRatings = {
  topSpeed: 90, acceleration: 88, stamina: 84, balance: 80, jump: 76, agility: 70,
  mentality: 86, response: 82, aggression: 78, teamWork: 74, longPassAccuracy: 72,
  shortPassAccuracy: 80, technique: 88, dribbleAccuracy: 84, dribbleSpeed: 82,
  shotAccuracy: 90, shotPower: 92, shotTechnique: 86, freeKickAccuracy: 70, swerve: 74,
  defense: 40, heading: 68, goalKeeping: 50, overall: 85,
};
const weak: PesRatings = {
  topSpeed: 62, acceleration: 60, stamina: 64, balance: 58, jump: 56, agility: 58,
  mentality: 60, response: 58, aggression: 60, teamWork: 58, longPassAccuracy: 54,
  shortPassAccuracy: 58, technique: 56, dribbleAccuracy: 54, dribbleSpeed: 56,
  shotAccuracy: 56, shotPower: 62, shotTechnique: 54, freeKickAccuracy: 50, swerve: 52,
  defense: 50, heading: 52, goalKeeping: 50, overall: 62,
};

describe("mapping PES stats onto our attributes", () => {
  it("fills every attribute our model has", () => {
    const a = toAttributes(strong);
    for (const group of [a.physical, a.mental, a.technical, a.goalkeeping]) {
      for (const [k, v] of Object.entries(group)) {
        expect(Number.isFinite(v), k).toBe(true);
        expect(v, k).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the player's shape — a fast finisher is not a good defender", () => {
    const a = toAttributes(strong);
    expect(a.physical.pace).toBeGreaterThan(a.technical.tackling);
    expect(a.technical.finishing).toBeGreaterThan(a.technical.marking);
  });

  it("ranks a better source player above a worse one on every axis it should", () => {
    const s = toAttributes(strong);
    const w = toAttributes(weak);
    expect(s.physical.pace).toBeGreaterThan(w.physical.pace);
    expect(s.technical.finishing).toBeGreaterThan(w.technical.finishing);
    expect(s.mental.composure).toBeGreaterThan(w.mental.composure);
  });

  it("splits tackling from marking, since the source has one defensive number", () => {
    // Not identical, and the difference is a real one: aggression leans towards
    // the tackle, reading the game towards the mark.
    const aggressive = toAttributes({ defense: 70, aggression: 90, response: 40 });
    expect(aggressive.technical.tackling).toBeGreaterThan(aggressive.technical.marking);
    const reader = toAttributes({ defense: 70, aggression: 40, response: 90 });
    expect(reader.technical.marking).toBeGreaterThan(reader.technical.tackling);
  });

  it("falls back rather than producing NaN for a threadbare row", () => {
    const a = toAttributes({}, 55);
    for (const v of attributeValues(a, true)) expect(v).toBe(55);
  });

  it("counts goalkeeping only when asked", () => {
    const a = toAttributes(strong);
    expect(attributeValues(a, true).length).toBe(attributeValues(a, false).length + 4);
  });
});

describe("fitting a sample onto a target distribution (used for the backfill)", () => {
  it("lands the sample exactly on the target mean and spread", () => {
    const source = [70, 74, 78, 82, 86];
    const from = distributionOf(source);
    const to = { mean: 58.7, sd: 10.94 };
    const t = calibrate(from, to);
    const moved = distributionOf(source.map((v) => v * t.scale + t.offset));
    expect(moved.mean).toBeCloseTo(to.mean, 6);
    expect(moved.sd).toBeCloseTo(to.sd, 6);
  });

  it("preserves order, so nobody overtakes anybody in the move", () => {
    const source = [62, 65, 71, 79, 85];
    const t = calibrate(distributionOf(source), { mean: 58.7, sd: 10.94 });
    const moved = source.map((v) => applyTransform(v, t));
    for (let i = 1; i < moved.length; i++) expect(moved[i]!).toBeGreaterThanOrEqual(moved[i - 1]!);
  });

  it("applies ONE transform to every attribute, so a shape can't be flattened", () => {
    // Two players; the gap between their pace and their tackling must survive.
    const t = calibrate({ mean: 73.6, sd: 8.12 }, { mean: 58.7, sd: 10.94 });
    const a = toAttributes(strong);
    const gapBefore = a.physical.pace - a.technical.tackling;
    const gapAfter = applyTransform(a.physical.pace, t) - applyTransform(a.technical.tackling, t);
    // Stretched by the scale factor, and still pointing the same way.
    expect(Math.sign(gapAfter)).toBe(Math.sign(gapBefore));
    expect(gapAfter).toBeCloseTo(gapBefore * t.scale, 0);
  });

  it("shifts, but refuses to stretch, a source where everyone is identical", () => {
    const t = calibrate({ mean: 70, sd: 0 }, { mean: 58.7, sd: 10.94 });
    expect(t.scale).toBe(1);
    expect(applyTransform(70, t)).toBe(59);
  });

  it("clamps into the attribute range instead of emitting an impossible rating", () => {
    const t = { scale: 3, offset: 0 };
    expect(applyTransform(95, t)).toBe(99);
    expect(applyTransform(1, { scale: 1, offset: -50 })).toBe(1);
  });

  it("does nothing under the identity", () => {
    expect(applyTransform(64, IDENTITY)).toBe(64);
  });
});

describe("players the source doesn't cover", () => {
  it("sits just below the rated population's centre", () => {
    const enriched = { mean: 76, sd: 3.5 };
    const target = unratedTarget(enriched);
    expect(target.mean).toBeLessThan(enriched.mean);
    // "A touch below", not a different class of footballer.
    expect(enriched.mean - target.mean).toBeLessThan(enriched.sd);
  });

  it("claims a NARROWER spread than the rated players, because we know less", () => {
    const enriched = { mean: 76, sd: 3.5 };
    expect(unratedTarget(enriched).sd).toBeLessThan(enriched.sd);
  });
});

describe("letting the source have the final word on how good a player is", () => {
  /** A weighted mean of attributes, which is what `positionOverall` is. */
  const meanOf = (a: ReturnType<typeof toAttributes>) => {
    const v = attributeValues(a, false);
    return v.reduce((x, y) => x + y, 0) / v.length;
  };

  it("moves the overall to the stated number exactly", () => {
    const a = toAttributes(weak);
    const computed = meanOf(a);
    const aligned = alignToStatedOverall(a, 62, computed);
    expect(meanOf(aligned)).toBeCloseTo(62, 0);
  });

  it("pulls an over-rated player DOWN as readily as it lifts an under-rated one", () => {
    const a = toAttributes(weak);
    const computed = meanOf(a);
    // Our blends measured ~7 points generous on the weakest players, which
    // compressed the league — the correction has to work downwards too.
    expect(meanOf(alignToStatedOverall(a, computed - 7, computed))).toBeLessThan(computed);
    expect(meanOf(alignToStatedOverall(a, computed + 7, computed))).toBeGreaterThan(computed);
  });

  it("shifts every attribute by the same amount, so the shape is untouched", () => {
    const a = toAttributes(strong);
    const computed = meanOf(a);
    const aligned = alignToStatedOverall(a, computed + 6, computed);
    const gap = (x: ReturnType<typeof toAttributes>) => x.physical.pace - x.technical.tackling;
    expect(gap(aligned)).toBe(gap(a));
  });

  it("leaves a row alone when the source has no overall to offer", () => {
    const a = toAttributes(strong);
    expect(alignToStatedOverall(a, undefined, meanOf(a))).toEqual(a);
  });

  it("does nothing when we already agree", () => {
    const a = toAttributes(strong);
    expect(alignToStatedOverall(a, Math.round(meanOf(a)), meanOf(a))).toEqual(a);
  });

  it("never emits a rating outside 1..99", () => {
    const a = toAttributes(strong);
    for (const target of [1, 99]) {
      for (const v of attributeValues(alignToStatedOverall(a, target, meanOf(a)), true)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });
});
