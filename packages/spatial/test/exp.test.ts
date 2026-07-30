import { describe, expect, it } from "vitest";
import { exp, tanSmall } from "../src/exp.js";
import { MAPS, DEFLECT, KINEMATICS, RATES, TURN_STEP } from "../src/config.js";

/** Relative error against Math.exp, in units of the result's own ulp. */
function ulpErr(x: number): number {
  const want = Math.exp(x);
  const got = exp(x);
  if (want === got) return 0;
  if (!Number.isFinite(want) || want === 0) return got === want ? 0 : Infinity;
  // ulp of `want`: the gap between it and the next representable double.
  const buf = new Float64Array([want]);
  const bits = new BigInt64Array(buf.buffer);
  bits[0] = bits[0]! + (want > 0 ? 1n : -1n);
  const ulp = Math.abs(buf[0]! - want);
  return Math.abs(got - want) / ulp;
}

function worstUlp(from: number, to: number, steps: number): { worst: number; at: number } {
  let worst = 0;
  let at = from;
  for (let i = 0; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    const e = ulpErr(x);
    if (e > worst) {
      worst = e;
      at = x;
    }
  }
  return { worst, at };
}

describe("deterministic exp", () => {
  it("is exact on the values that must be exact", () => {
    expect(exp(0)).toBe(1);
    expect(exp(-Infinity)).toBe(0);
    expect(exp(Infinity)).toBe(Infinity);
    expect(Number.isNaN(exp(NaN))).toBe(true);
  });

  it("matches Math.exp to within 2 ulp over the Gaussian-splat range", () => {
    // Grid.splat's argument is -(dx^2+dy^2)/(2*sigma^2), always <= 0. The stencil
    // reaches ceil(3*sigma/cell) cells, so bound the argument from the config
    // rather than a guessed number — if sigma or the cell size change, this range
    // follows them.
    const reach = Math.ceil((MAPS.sigma * 3) / MAPS.cell) * MAPS.cell + MAPS.cell;
    const worstArg = -(2 * reach * reach) / (2 * MAPS.sigma * MAPS.sigma);
    expect(worstArg).toBeLessThan(0);
    const { worst, at } = worstUlp(worstArg, 0, 20000);
    expect(worst, `worst ${worst} ulp at x=${at}`).toBeLessThan(2);
  });

  it("matches Math.exp to within 2 ulp over the softmax range", () => {
    // softmaxPick feeds (score - max)/tau, which is <= 0 and unbounded below.
    const { worst, at } = worstUlp(-80, 0, 20000);
    expect(worst, `worst ${worst} ulp at x=${at}`).toBeLessThan(2);
  });

  it("matches Math.exp to within 2 ulp across the whole finite range", () => {
    const { worst, at } = worstUlp(-745, 709, 50000);
    expect(worst, `worst ${worst} ulp at x=${at}`).toBeLessThan(2);
  });

  it("handles the extremes without losing the finite values near them", () => {
    expect(exp(709.7)).toBeGreaterThan(0);
    expect(Number.isFinite(exp(709.7))).toBe(true);
    expect(ulpErr(709.7)).toBeLessThan(2);
    expect(ulpErr(-744)).toBeLessThan(2);
    expect(exp(710)).toBe(Infinity);
    expect(exp(-746)).toBe(0);
  });

  it("is monotonic — a non-monotonic exp would make the influence field lumpy", () => {
    let prev = -Infinity;
    for (let x = -30; x <= 30; x += 0.001) {
      const y = exp(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

describe("pinned trig literals", () => {
  // These exist ONLY because Math.cos/sin/tan are not portable. The literals are
  // what the engine runs on; Math.* is used here purely as the reference, so that
  // changing turnRate or physicsHz cannot silently leave the pair describing the
  // old angle.
  it("TURN_STEP matches turnRate / physicsHz", () => {
    expect(TURN_STEP.rad).toBe(KINEMATICS.turnRate / RATES.physicsHz);
    expect(TURN_STEP.cos).toBeCloseTo(Math.cos(TURN_STEP.rad), 15);
    expect(TURN_STEP.sin).toBeCloseTo(Math.sin(TURN_STEP.rad), 15);
    // and it is a genuine unit vector, or players would gain/lose speed on turning
    expect(TURN_STEP.cos * TURN_STEP.cos + TURN_STEP.sin * TURN_STEP.sin).toBeCloseTo(1, 15);
  });

  it("tanSmall is accurate over the range the deflection actually draws", () => {
    let worst = 0;
    const lim = DEFLECT.halfSpreadRad;
    for (let i = 0; i <= 20000; i++) {
      const z = -lim + (2 * lim * i) / 20000;
      worst = Math.max(worst, Math.abs(tanSmall(z) - Math.tan(z)));
    }
    expect(worst, `worst absolute error ${worst}`).toBeLessThan(1e-7);
    expect(tanSmall(0)).toBe(0);
    // odd, like the real thing — a biased deflection would curve every rebound one way
    expect(tanSmall(0.2)).toBe(-tanSmall(-0.2));
  });

  it("keeps the deflection angle uniform, as Math.cos/sin did", () => {
    // The half-angle identities turn t = tan(θ/2) into a rotation. Drawing `t`
    // uniformly would have been simpler but skews θ (density ∝ 1+t²) — measured at
    // +1.7% on the standard deviation. Going through tanSmall keeps θ uniform, so
    // the hardening changes no behaviour. This test is what holds that line.
    const angleFor = (u: number): number => {
      const t = tanSmall((u - 0.5) * 2 * DEFLECT.halfSpreadRad);
      const inv = 1 / (1 + t * t);
      return Math.atan2(2 * t * inv, (1 - t * t) * inv);
    };
    const n = 20000;
    const angles: number[] = [];
    for (let i = 0; i < n; i++) angles.push(angleFor((i + 0.5) / n));

    const mean = angles.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(angles.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
    // A uniform distribution on ±h has mean 0 and sd h/sqrt(3).
    const h = 2 * DEFLECT.halfSpreadRad;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
    expect(Math.abs(sd - h / Math.sqrt(3))).toBeLessThan(1e-6);
    expect(Math.min(...angles)).toBeGreaterThan(-h);
    expect(Math.max(...angles)).toBeLessThan(h);
  });
});
