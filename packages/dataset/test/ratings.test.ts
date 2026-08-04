import { describe, expect, it } from "vitest";
import {
  applyTransform,
  attributeValues,
  calibrate,
  distributionOf,
  IDENTITY,
  REQUIRED_LABELS,
  SCALE_ANCHORS,
  toAttributes,
  toOurScale,
  unratedTarget,
} from "../src/index.js";

/**
 * Importing a foreign rating scale.
 *
 * The source is Football Manager's attribute set, and the mapping onto ours is one-to-one — so
 * unlike the source this replaced there is nothing to blend and no blending bias to correct. What
 * these tests defend is the two places the import can still lie: filling in a label the source
 * never published (which would fabricate data and label it sourced), and squashing the scale on
 * the way in (which would reintroduce the compression that was the reason for changing source).
 *
 * The rescaling machinery (`calibrate`) is here for the BACKFILL: placing the ~19% of players the
 * source doesn't cover onto the rated population's distribution, a touch below its centre.
 */

/** FM's native 1–20, keyed by the source's own published labels. */
const OUTFIELD_LABELS = REQUIRED_LABELS.outfield;
const GK_LABELS = REQUIRED_LABELS.goalkeeper;

const row = (labels: readonly string[], v: number, tilt: Record<string, number> = {}) => ({
  ...Object.fromEntries(labels.map((l) => [l, v])),
  ...tilt,
});

describe("FM's 1–20 onto our 1–99", () => {
  it("hits every anchor exactly, because the anchors ARE the definition", () => {
    for (const a of Object.values(SCALE_ANCHORS)) expect(toOurScale(a.source)).toBe(a.ours);
  });

  it("stops short of the ceiling, so the scale never saturates", () => {
    // A straight stretch to 99 clamped a fifth of a percent of attributes and squashed everyone
    // above FM 18 into the same number. The top of the scale is deliberately unspent.
    expect(toOurScale(20)).toBeLessThan(99);
    expect(toOurScale(20)).toBeGreaterThan(toOurScale(19));
  });

  it("is monotonic, so no two source values swap places", () => {
    for (let v = 2; v <= 20; v++) expect(toOurScale(v)).toBeGreaterThan(toOurScale(v - 1));
  });

  it("bends at the league-star anchor, generous below it and shallow above", () => {
    // Two slopes, and the difference between them is the whole design: the body of the distribution
    // keeps the source's own spacing, and only the handful of outliers above it get compressed.
    const body = toOurScale(14) - toOurScale(13);
    const tail = toOurScale(19) - toOurScale(18);
    expect(body).toBeGreaterThan(tail);
    expect(body).toBeGreaterThanOrEqual(4); // enough that good players pull clear of ordinary ones
  });

  it("never emits a rating outside 1..99, even for a nonsense source value", () => {
    for (const v of [-5, 0, 21, 99]) {
      expect(toOurScale(v)).toBeGreaterThanOrEqual(1);
      expect(toOurScale(v)).toBeLessThanOrEqual(99);
    }
  });
});

describe("mapping the source's labels onto our attributes", () => {
  it("fills every outfield attribute from a complete outfield row", () => {
    const { attributes, missing } = toAttributes(row(OUTFIELD_LABELS, 14));
    // The keeper labels are reported absent, because an outfield page genuinely has none — this
    // stage reads all 24 and reports; deciding whether that matters is the resolver's job.
    expect(missing.sort()).toEqual(["Command of Area", "Handling", "One on Ones", "Reflexes"]);
    for (const group of [attributes.physical, attributes.mental, attributes.technical]) {
      for (const [k, v] of Object.entries(group)) {
        expect(Number.isFinite(v), k).toBe(true);
        expect(v, k).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the player's shape — a fast finisher is not a good defender", () => {
    const { attributes } = toAttributes(row(OUTFIELD_LABELS, 10, { Pace: 18, Finishing: 17, Tackling: 5, Marking: 4 }));
    expect(attributes.physical.pace!).toBeGreaterThan(attributes.technical.tackling!);
    expect(attributes.technical.finishing!).toBeGreaterThan(attributes.technical.marking!);
  });

  it("ranks a better source player above a worse one on every axis", () => {
    const s = toAttributes(row(OUTFIELD_LABELS, 16)).attributes;
    const w = toAttributes(row(OUTFIELD_LABELS, 9)).attributes;
    expect(s.physical.pace!).toBeGreaterThan(w.physical.pace!);
    expect(s.technical.finishing!).toBeGreaterThan(w.technical.finishing!);
    expect(s.mental.composure!).toBeGreaterThan(w.mental.composure!);
  });

  it("reads tackling and marking as the two INDEPENDENT numbers the source publishes", () => {
    // The source this replaced had one defensive figure that both had to be derived from, which
    // forced them to move together. Here a hard tackler who doesn't track his man is expressible.
    const { attributes } = toAttributes(row(OUTFIELD_LABELS, 10, { Tackling: 17, Marking: 6 }));
    expect(attributes.technical.tackling!).toBeGreaterThan(attributes.technical.marking!);
  });

  /**
   * The one that caught a real fault: a neutral fallback would have handed every goalkeeper in the
   * league a fabricated `finishing` and marked it as sourced data.
   */
  it("OMITS a label the source never published rather than inventing a value for it", () => {
    const { attributes, missing } = toAttributes(row(GK_LABELS, 13));
    expect(missing).toContain("Finishing");
    expect("finishing" in attributes.technical).toBe(false);
    expect("marking" in attributes.technical).toBe(false);
    expect(attributes.goalkeeping.reflexes).toBe(toOurScale(13));
  });

  it("names the labels it could not read, including the unreadable ones", () => {
    const complete = { ...row(OUTFIELD_LABELS, 12), ...row(GK_LABELS, 12) };
    expect(toAttributes(complete).missing).toEqual([]);
    // NaN and undefined are as absent as a missing key: neither is a rating.
    const { missing } = toAttributes({ ...complete, Pace: Number.NaN, Vision: undefined as never });
    expect(missing.sort()).toEqual(["Pace", "Vision"]);
  });

  it("counts goalkeeping only when asked", () => {
    const { attributes } = toAttributes({ ...row(OUTFIELD_LABELS, 12), ...row(GK_LABELS, 12) });
    expect(attributeValues(attributes, true).length).toBe(attributeValues(attributes, false).length + 4);
  });
});

describe("what a usable row has to carry", () => {
  it("asks a keeper for goalkeeping labels and an outfielder for outfield ones", () => {
    expect(GK_LABELS).toContain("Reflexes");
    expect(GK_LABELS).toContain("Command of Area");
    expect(OUTFIELD_LABELS).not.toContain("Reflexes");
  });

  /**
   * Regression: demanding the outfield set from everybody rejected all 65 goalkeepers in the
   * league on the first run, because FM shows a keeper goalkeeping technicals INSTEAD of these.
   */
  it("does not demand outfield technicals from a keeper, who has none", () => {
    for (const l of ["Crossing", "Finishing", "Tackling", "Marking", "Dribbling", "Long Shots"]) {
      expect(GK_LABELS, l).not.toContain(l);
    }
  });

  it("asks both kinds of player for the mental and physical labels every page carries", () => {
    for (const l of ["Pace", "Decisions", "Composure", "Anticipation", "Passing"]) {
      expect(OUTFIELD_LABELS, l).toContain(l);
      expect(GK_LABELS, l).toContain(l);
    }
  });

  it("uses no source label twice, so no two attributes are the same number renamed", () => {
    const all = [...OUTFIELD_LABELS, ...GK_LABELS.filter((l) => !OUTFIELD_LABELS.includes(l))];
    expect(new Set(all).size).toBe(all.length);
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
    const t = calibrate({ mean: 73.6, sd: 8.12 }, { mean: 58.7, sd: 10.94 });
    // A moderate tilt on purpose: a wider one would hit the 1..99 clamp, which is a separate
    // property (below) and would hide whether the transform itself preserved the gap.
    const { attributes } = toAttributes(row(OUTFIELD_LABELS, 12, { Pace: 16, Tackling: 10 }));
    const gapBefore = attributes.physical.pace! - attributes.technical.tackling!;
    const gapAfter = applyTransform(attributes.physical.pace!, t) - applyTransform(attributes.technical.tackling!, t);
    expect(Math.sign(gapAfter)).toBe(Math.sign(gapBefore));
    expect(gapAfter).toBeCloseTo(gapBefore * t.scale, -0.5); // integer rounding on both ends
  });

  it("shifts, but refuses to stretch, a source where everyone is identical", () => {
    const t = calibrate({ mean: 70, sd: 0 }, { mean: 58.7, sd: 10.94 });
    expect(t.scale).toBe(1);
    expect(applyTransform(70, t)).toBe(59);
  });

  it("clamps into the attribute range instead of emitting an impossible rating", () => {
    expect(applyTransform(95, { scale: 3, offset: 0 })).toBe(99);
    expect(applyTransform(1, { scale: 1, offset: -50 })).toBe(1);
  });

  it("does nothing under the identity", () => {
    expect(applyTransform(64, IDENTITY)).toBe(64);
  });
});

describe("players the source doesn't cover", () => {
  it("sits just below the rated population's centre", () => {
    const rated = { mean: 76, sd: 3.5 };
    const target = unratedTarget(rated);
    expect(target.mean).toBeLessThan(rated.mean);
    // "A touch below", not a different class of footballer.
    expect(rated.mean - target.mean).toBeLessThan(rated.sd);
  });

  it("claims a NARROWER spread than the rated players, because we know less", () => {
    const rated = { mean: 76, sd: 3.5 };
    expect(unratedTarget(rated).sd).toBeLessThan(rated.sd);
  });
});
