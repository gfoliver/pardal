import { clamp, type Vec2 } from "./math.js";

/**
 * Pitch geometry in metres — the SINGLE SOURCE OF TRUTH for the field. All
 * dimensions follow IFAB/FIFA standards for a 105×68 pitch. Coordinates: x
 * along the length (0 = home goal line, LENGTH = away goal line), y across the
 * width (0..WIDTH). Home attacks toward +x, away toward −x. Origin bottom-left.
 *
 * The frontend renders the pitch from {@link pitchGeometry}, so what you see is
 * exactly these coordinates and proportions — no hand-tuned drawing constants.
 */
export const FIELD = {
  LENGTH: 105,
  WIDTH: 68,
  /** Goal mouth. */
  GOAL_WIDTH: 7.32,
  GOAL_Y0: (68 - 7.32) / 2,
  GOAL_Y1: (68 + 7.32) / 2,
  /** How far the net box extends behind the goal line (visual). */
  GOAL_DEPTH: 2.2,
  /** Penalty area (18-yard box). */
  PENALTY_DEPTH: 16.5,
  PENALTY_WIDTH: 40.32,
  /** Goal area (6-yard box). */
  GOAL_AREA_DEPTH: 5.5,
  GOAL_AREA_WIDTH: 18.32,
  /** Penalty mark distance from the goal line. */
  PENALTY_SPOT_DIST: 11,
  /** Centre circle / penalty arc radius. */
  CENTRE_RADIUS: 9.15,
  /** Corner arc radius. */
  CORNER_RADIUS: 1,
  CENTRE: { x: 52.5, y: 34 } as Vec2,
};

/** Attack direction for a side: home → +1 (toward x=105), away → −1. */
export type SideDir = 1 | -1;

/** x-coordinate of the goal a side is attacking. */
export function attackGoalX(dir: SideDir): number {
  return dir === 1 ? FIELD.LENGTH : 0;
}

/** Centre of the goal a side attacks. */
export function attackGoal(dir: SideDir): Vec2 {
  return { x: attackGoalX(dir), y: FIELD.WIDTH / 2 };
}

export function inPitch(p: Vec2): boolean {
  return p.x >= 0 && p.x <= FIELD.LENGTH && p.y >= 0 && p.y <= FIELD.WIDTH;
}

export function clampToPitch(p: Vec2): Vec2 {
  return { x: clamp(p.x, 0, FIELD.LENGTH), y: clamp(p.y, 0, FIELD.WIDTH) };
}

/** True if the point is inside the penalty area a side is ATTACKING. */
export function inAttackingBox(p: Vec2, dir: SideDir): boolean {
  const withinY = p.y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && p.y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
  const withinX = dir === 1 ? p.x >= FIELD.LENGTH - FIELD.PENALTY_DEPTH : p.x <= FIELD.PENALTY_DEPTH;
  return withinX && withinY;
}

/** Whether a ball crossing a goal line passed between the posts. */
export function isGoal(p: Vec2, attackingDir: SideDir): boolean {
  const line = attackGoalX(attackingDir);
  const crossed = attackingDir === 1 ? p.x >= line : p.x <= line;
  return crossed && p.y >= FIELD.GOAL_Y0 && p.y <= FIELD.GOAL_Y1;
}

// ---- Drawable geometry ------------------------------------------------------
// Primitives are in the SAME metre coordinates as everything else, so a client
// can draw them with one shared projection and get a pixel-faithful pitch.

/** A rectangle to stroke, in metres (origin at its bottom-left corner). */
export interface PitchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A circular arc in metres; angles in radians, CCW, engine frame (0 = +x). */
export interface PitchArc {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
}
export interface PitchGeometry {
  length: number;
  width: number;
  goalWidth: number;
  /** Outer touchline/goal-line boundary. */
  boundary: PitchRect;
  /** Straight lines (each a pair of endpoints): the halfway line. */
  lines: [Vec2, Vec2][];
  /** Penalty areas + goal areas (both ends), to be stroked. */
  areas: PitchRect[];
  /** Goal frames behind each goal line, to be stroked/filled. */
  goals: PitchRect[];
  /** Full circles: the centre circle. */
  circles: { c: Vec2; r: number }[];
  /** Marked spots: centre spot + both penalty spots. */
  spots: Vec2[];
  /** Arcs: both penalty arcs + four corner arcs. */
  arcs: PitchArc[];
}

/**
 * The complete set of pitch markings in metres. The renderer projects these
 * with the same transform it uses for players/ball, guaranteeing the display
 * matches the engine's coordinates and proportions exactly.
 */
export function pitchGeometry(): PitchGeometry {
  const L = FIELD.LENGTH;
  const W = FIELD.WIDTH;
  const midY = W / 2;
  const penY = (W - FIELD.PENALTY_WIDTH) / 2;
  const gaY = (W - FIELD.GOAL_AREA_WIDTH) / 2;
  const goalHalf = FIELD.GOAL_WIDTH / 2;

  // Penalty-arc half-angle: where the arc meets the box edge.
  const dPen = FIELD.PENALTY_DEPTH - FIELD.PENALTY_SPOT_DIST; // 5.5
  const arcHalf = Math.acos(dPen / FIELD.CENTRE_RADIUS);
  const c = FIELD.CORNER_RADIUS;

  return {
    length: L,
    width: W,
    goalWidth: FIELD.GOAL_WIDTH,
    boundary: { x: 0, y: 0, w: L, h: W },
    lines: [[{ x: L / 2, y: 0 }, { x: L / 2, y: W }]],
    areas: [
      // Penalty areas
      { x: 0, y: penY, w: FIELD.PENALTY_DEPTH, h: FIELD.PENALTY_WIDTH },
      { x: L - FIELD.PENALTY_DEPTH, y: penY, w: FIELD.PENALTY_DEPTH, h: FIELD.PENALTY_WIDTH },
      // Goal areas (6-yard)
      { x: 0, y: gaY, w: FIELD.GOAL_AREA_DEPTH, h: FIELD.GOAL_AREA_WIDTH },
      { x: L - FIELD.GOAL_AREA_DEPTH, y: gaY, w: FIELD.GOAL_AREA_DEPTH, h: FIELD.GOAL_AREA_WIDTH },
    ],
    goals: [
      { x: -FIELD.GOAL_DEPTH, y: midY - goalHalf, w: FIELD.GOAL_DEPTH, h: FIELD.GOAL_WIDTH },
      { x: L, y: midY - goalHalf, w: FIELD.GOAL_DEPTH, h: FIELD.GOAL_WIDTH },
    ],
    circles: [{ c: { x: L / 2, y: midY }, r: FIELD.CENTRE_RADIUS }],
    spots: [
      { x: L / 2, y: midY },
      { x: FIELD.PENALTY_SPOT_DIST, y: midY },
      { x: L - FIELD.PENALTY_SPOT_DIST, y: midY },
    ],
    arcs: [
      // Penalty arcs (portion outside each box)
      { cx: FIELD.PENALTY_SPOT_DIST, cy: midY, r: FIELD.CENTRE_RADIUS, a0: -arcHalf, a1: arcHalf },
      { cx: L - FIELD.PENALTY_SPOT_DIST, cy: midY, r: FIELD.CENTRE_RADIUS, a0: Math.PI - arcHalf, a1: Math.PI + arcHalf },
      // Corner arcs (quarter circles opening into the pitch)
      { cx: 0, cy: 0, r: c, a0: 0, a1: Math.PI / 2 },
      { cx: L, cy: 0, r: c, a0: Math.PI / 2, a1: Math.PI },
      { cx: L, cy: W, r: c, a0: Math.PI, a1: (3 * Math.PI) / 2 },
      { cx: 0, cy: W, r: c, a0: (3 * Math.PI) / 2, a1: 2 * Math.PI },
    ],
  };
}
