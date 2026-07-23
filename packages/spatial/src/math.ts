/** Minimal 2D vector helpers (metres). Plain objects for cheap allocation. */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Unit vector at angle `a` (radians). */
export const fromAngle = (a: number): Vec2 => ({ x: Math.cos(a), y: Math.sin(a) });

/** Angle (radians) of a vector. */
export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Linear interpolation between a and b. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Clamp a vector's length to `max`. */
export function limit(a: Vec2, max: number): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l <= max || l < 1e-6 ? a : { x: (a.x / l) * max, y: (a.y / l) * max };
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/**
 * Rotate vector `from` toward the heading of `to` by at most `maxRad`, keeping
 * `to`'s magnitude. Models bodily inertia: players can't reverse instantly.
 */
export function rotateToward(from: Vec2, to: Vec2, maxRad: number): Vec2 {
  const fromLen = Math.hypot(from.x, from.y);
  const toLen = Math.hypot(to.x, to.y);
  if (fromLen < 1e-6 || toLen < 1e-6) return to;
  const aFrom = Math.atan2(from.y, from.x);
  const aTo = Math.atan2(to.y, to.x);
  let diff = aTo - aFrom;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) <= maxRad) return to;
  const a = aFrom + Math.sign(diff) * maxRad;
  return { x: Math.cos(a) * toLen, y: Math.sin(a) * toLen };
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
  return { dist: Math.hypot(p.x - cx, p.y - cy), t };
}
