/**
 * Minimal 2D vector helpers (metres). Plain objects for cheap allocation.
 *
 * PORTABILITY RULE for this whole package: only `+ - * /`, `Math.sqrt`, `Math.abs`,
 * `min`/`max`/`floor`/`ceil`/`round`/`sign`, `Math.imul` and the bitwise operators
 * may be used. Those are exactly specified by IEEE-754 and ECMAScript, so they give
 * bit-identical results on every engine. `hypot`, `exp`, `pow`, `**`, `log`, the
 * trigonometric functions and their inverses are all IMPLEMENTATION-APPROXIMATED —
 * V8, SpiderMonkey and JavaScriptCore legitimately disagree in the last bits, and
 * JSC hands several of them to the platform libm.
 *
 * That matters here because the simulation is chaotic: a measured 1-ulp change to
 * `dist()` alone flipped 5 of 12 final scorelines. Since multiplayer has every
 * client re-simulate the same seed and compare, one stray `Math.hypot` is enough to
 * show two players different results. There is no "close enough" in this package.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
// sqrt(x*x + y*y) rather than hypot: hypot's overflow-safe scaling is unspecified,
// and pointless at pitch magnitudes (0–125 m). sqrt IS correctly rounded, so this is
// both exact across runtimes and ~15x faster — hypot was ~12% of a whole match.
export const len = (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y);
export const dist = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function norm(a: Vec2): Vec2 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D cross product (z of the 3D cross) — sign tells which way `b` lies from `a`. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

/** Linear interpolation between a and b. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Clamp a vector's length to `max`. */
export function limit(a: Vec2, max: number): Vec2 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y);
  return l <= max || l < 1e-6 ? a : { x: (a.x / l) * max, y: (a.y / l) * max };
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/**
 * A rotation limit, held as the COSINE AND SINE of the angle rather than the angle.
 *
 * `rotateToward` needs cos/sin of its limit, and computing them at load time with
 * `Math.cos` would reintroduce exactly the portability problem this package is
 * avoiding — the value would differ between engines and every player would then
 * turn a hair differently. So limits are exact decimal literals (a decimal literal
 * parses to the same double everywhere) built by {@link turnLimit}, and a test
 * pins them against `Math.cos`/`Math.sin` in Node so the pair cannot silently drift
 * away from the angle it claims to represent.
 */
export interface TurnLimit {
  /** cos(angle). */
  readonly cos: number;
  /** sin(angle), angle > 0. */
  readonly sin: number;
  /** The angle itself, in radians — for the pinning test and for documentation. */
  readonly rad: number;
}

/** Declare a rotation limit from precomputed exact literals. See {@link TurnLimit}. */
export const turnLimit = (rad: number, cos: number, sin: number): TurnLimit => ({ rad, cos, sin });

/**
 * Rotate vector `from` toward the heading of `to` by at most `max`, keeping `to`'s
 * magnitude. Models bodily inertia: players can't reverse instantly.
 *
 * Done with a dot/cross test and a 2x2 rotation instead of going through angles.
 * Where the old version took atan2 of both vectors, differenced and normalised the
 * angles, then took cos/sin of the result, this compares cos(diff) = dot(û, ŵ)
 * against cos(max) directly and rotates û by the matrix built from `max`. Same
 * mathematics, no transcendentals, and it drops 2 atan2 plus a cos/sin from the
 * hottest loop in the engine (every agent, every 60 Hz substep).
 */
export function rotateToward(from: Vec2, to: Vec2, max: TurnLimit): Vec2 {
  const fromLen = Math.sqrt(from.x * from.x + from.y * from.y);
  const toLen = Math.sqrt(to.x * to.x + to.y * to.y);
  if (fromLen < 1e-6 || toLen < 1e-6) return to;
  const fx = from.x / fromLen;
  const fy = from.y / fromLen;
  const tx = to.x / toLen;
  const ty = to.y / toLen;
  // cos of the angle between them. Already within the limit → keep `to` untouched,
  // which is what the angle version did, so the common case is bit-for-bit unchanged.
  const cosDiff = fx * tx + fy * ty;
  if (cosDiff >= max.cos) return to;
  // Turn by exactly `max`, toward `to`: the cross product's sign says which way.
  const s = fx * ty - fy * tx < 0 ? -1 : 1;
  const sinM = s * max.sin;
  return {
    x: (fx * max.cos - fy * sinM) * toLen,
    y: (fx * sinM + fy * max.cos) * toLen,
  };
}

/**
 * Shortest distance from point p to the segment a→b, and the closest point.
 * Used for pass-lane interception tests.
 */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return { dist: dist(p, a), t: 0 };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = clamp(t, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { dist: Math.sqrt(dx * dx + dy * dy), t };
}
