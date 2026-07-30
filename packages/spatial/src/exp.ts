/**
 * Bit-reproducible replacements for the `Math` functions this engine needs.
 *
 * A bit-reproducible `exp`, and `tanSmall` for the one place a tangent is required.
 *
 * `Math.exp` is implementation-approximated: V8, SpiderMonkey and JavaScriptCore
 * are each free to return a differently-rounded result, and JSC delegates to the
 * platform libm, so even two Safaris can disagree. That is fatal here — the
 * influence field (`Grid.splat`) and the action selector (`softmaxPick`) both run
 * on `exp`, and the simulation is chaotic enough that a last-bit difference
 * changes scorelines. See the portability note at the top of `math.ts`.
 *
 * So this computes it from `+ - * /` and exact powers of two only, which ARE
 * specified to the bit, by the textbook route:
 *
 *   1. reduce x = k·ln2 + r with |r| ≤ ln2/2, k an integer
 *   2. evaluate exp(r) as a degree-14 Taylor series (truncation ≈ 1e-19 at the
 *      worst r, i.e. ~1/2000 ulp — the polynomial is not the error term here)
 *   3. scale by 2^k, which is exact
 *
 * ln2 is carried in two pieces, and BOTH halves matter for a reason worth stating
 * because getting it wrong is silent and passes casual testing:
 *
 *   - `k · LN2_HI` must be exact. LN2_HI has its low 20 mantissa bits cleared,
 *     leaving 33 significant bits, and |k| < 2^11, so the product needs at most 44
 *     of the 53 available.
 *   - the PAIR must approximate the true ln2 to ~85 bits, not merely re-sum to the
 *     double `Math.LN2`. Splitting `Math.LN2` in half satisfies the first condition
 *     and fails this one: the pair then carries only ln2's own 53-bit rounding
 *     error, ~8e-18, and `k · that` reaches 8e-15 at |k| ≈ 1024 — which lands
 *     directly on the result as relative error. Measured that way: ~200 ulp at
 *     x = 709.7, versus under 1 ulp with the constants below (fdlibm's).
 *
 * Accuracy against `Math.exp` is asserted over the ranges the engine actually
 * uses (and well beyond) in `exp.test.ts`.
 */

// 1/k! for k = 2..14.
const C2 = 0.5;
const C3 = 0.16666666666666666;
const C4 = 0.041666666666666664;
const C5 = 0.008333333333333333;
const C6 = 0.001388888888888889;
const C7 = 0.0001984126984126984;
const C8 = 0.0000248015873015873;
const C9 = 0.0000027557319223985893;
const C10 = 2.755731922398589e-7;
const C11 = 2.505210838544172e-8;
const C12 = 2.08767569878681e-9;
const C13 = 1.6059043836821613e-10;
const C14 = 1.1470745597729725e-11;

const INV_LN2 = 1.4426950408889634;
/** ln2's leading 33 bits — low 20 mantissa bits are zero, so k * LN2_HI is exact. */
const LN2_HI = 6.9314718036912381649e-1;
/** ...and the next ~52 bits of the TRUE ln2, continuing where LN2_HI stops. */
const LN2_LO = 1.90821492927058770002e-10;

/** exp overflows the double range just above this. */
const OVERFLOW = 709.7827128933841;
/** ...and underflows to zero just below this. */
const UNDERFLOW = -745.1332191019411;

/**
 * POW2[i] = 2^(i − 1023), every entry an exact power of two: doubling and halving
 * a power of two is exact all the way out to the subnormals and to zero, so the
 * table carries no rounding of its own. Built once, read-only thereafter.
 */
const POW2 = ((): Float64Array => {
  const t = new Float64Array(2047);
  t[1023] = 1;
  for (let i = 1024; i <= 2046; i++) t[i] = t[i - 1]! * 2;
  for (let i = 1022; i >= 0; i--) t[i] = t[i + 1]! / 2;
  return t;
})();

/** Multiply by 2^k, splitting the step when 2^k alone would overflow the table. */
function scale2(y: number, k: number): number {
  if (k > 1023) return y * POW2[2046]! * POW2[k - 1023 + 1023]!;
  if (k < -1023) return y * POW2[0]! * POW2[k + 1023 + 1023]!;
  return y * POW2[k + 1023]!;
}

/** e raised to `x`, identically on every JS engine. Drop-in for `Math.exp`. */
export function exp(x: number): number {
  // NaN first: every comparison below is false for NaN, so it must not fall through.
  if (Number.isNaN(x)) return NaN;
  if (x >= OVERFLOW) return Infinity;
  if (x <= UNDERFLOW) return 0;
  const k = Math.round(x * INV_LN2);
  // Two-step reduction; the parenthesisation is load-bearing, not decoration.
  const r = x - k * LN2_HI - k * LN2_LO;
  const e =
    1 +
    r *
      (1 +
        r *
          (C2 +
            r *
              (C3 +
                r *
                  (C4 +
                    r *
                      (C5 +
                        r *
                          (C6 +
                            r *
                              (C7 +
                                r * (C8 + r * (C9 + r * (C10 + r * (C11 + r * (C12 + r * (C13 + r * C14)))))))))))));
  return scale2(e, k);
}

// tan's Maclaurin coefficients: z + z³/3 + 2z⁵/15 + 17z⁷/315 + 62z⁹/2835 + 1382z¹¹/155925
const T1 = 0.3333333333333333;
const T2 = 0.13333333333333333;
const T3 = 0.05396825396825397;
const T4 = 0.021869488536155203;
const T5 = 0.008863235529902197;

/**
 * `tan(z)` for SMALL |z| — accurate to ~1e-8 absolute for |z| ≤ 0.35, and rapidly
 * worse beyond that. No range reduction, deliberately: the one caller draws a
 * bounded angle.
 *
 * It exists so a random angle can be drawn UNIFORMLY and still turned into a
 * rotation without trigonometry, via the half-angle identities
 * cos θ = (1−t²)/(1+t²), sin θ = 2t/(1+t²) with t = tan(θ/2). Drawing `t` uniformly
 * instead would have been simpler and needs no tangent at all, but it warps the
 * angle distribution (density ∝ 1+t²): measured against the old `Math.cos`/`Math.sin`
 * deflection that widened the standard deviation by 1.7% and moved the deciles by
 * half a degree. Through this series the distribution matches the old one to 9e-10,
 * which keeps the hardening a genuinely behaviour-free change.
 */
export function tanSmall(z: number): number {
  const z2 = z * z;
  return z * (1 + z2 * (T1 + z2 * (T2 + z2 * (T3 + z2 * (T4 + z2 * T5)))));
}
