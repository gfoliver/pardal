import type { PenaltyKick } from "@fut/engine";

/**
 * The geometry behind the penalty replay: the camera, the goal, and where the
 * ball and the keeper are at any point of the kick.
 *
 * Kept apart from the drawing on purpose. Everything here is pure arithmetic on
 * real dimensions, so it can be checked without a browser — and the component
 * that consumes it holds no measurements of its own, which is what stops the
 * picture and the recorded kick from drifting apart.
 */
export const GOAL_HALF = 7.32 / 2;
export const GOAL_HEIGHT = 2.44;
export const POST = 0.12; // post/bar thickness
export const NET_DEPTH = 2.2; // how far the net box runs behind the goal line
export const SPOT_DEPTH = 11; // the penalty mark
/** The ball, drawn at twice life size — true scale is a legible 3 px at this crop. */
export const BALL_R = 0.22;
/** How far from the centre of the goal a full-length dive reaches, in metres. */
export const KEEPER_REACH = 2.6;
/**
 * The keeper's body, boots to the base of his reaching arm — the span the
 * skeleton is laid over. The drawing may bend him but never stretch or shrink
 * him; at full length his arm reaches PAST this, so boot-to-fingertip comes out
 * around 2.4 m, which is what a diving keeper actually covers.
 */
export const KEEPER_LENGTH = 1.85;

const CAM_H = 2.6; // camera height, behind and slightly above the taker
const CAM_D = 26; // camera distance behind the goal line
const FOCAL = 26; // chosen so the scale is exactly 1 in the plane of the goal

export interface Projected {
  readonly x: number;
  readonly y: number;
  /** Size multiplier at that depth — near things are drawn bigger. */
  readonly s: number;
}

/** Project a world point. `depth` is metres in FRONT of the goal line. */
export function project(x: number, height: number, depth: number): Projected {
  const s = FOCAL / (CAM_D - depth);
  return { x: x * s, y: (CAM_H - height) * s, s };
}

/** The goal line, where the grass meets the frame. */
export const GROUND = project(0, 0, 0).y;
export const BAR = project(0, GOAL_HEIGHT, 0).y;
/** The crop: wide enough for the six-yard box to run off both sides. */
export const VIEWBOX = { x: -6.6, y: -0.7, w: 13.2, h: 6.0 };

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const easeOut = (t: number): number => 1 - (1 - t) ** 1.6;
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);

/** Where the ball finished, in metres, from the recorded picture. */
export function ballPoint(k: PenaltyKick): { x: number; height: number } {
  return { x: k.x * GOAL_HALF, height: k.y * GOAL_HEIGHT };
}

/** True while the ball is still inside the frame — i.e. it was on target. */
export function onTarget(k: PenaltyKick): boolean {
  return Math.abs(k.x) <= 1 && k.y <= 1;
}

/**
 * Where the keeper's gloves end up.
 *
 * Reaching a ball is the same movement as diving at one, so when he SAVED it his
 * gloves are ON the ball — anything else draws a keeper diving past a shot he
 * stopped. Beaten, he goes to full stretch along the line he chose and the ball
 * is visibly past his fingertips.
 */
export function keeperTarget(k: PenaltyKick): { x: number; height: number } {
  const ball = ballPoint(k);
  if (k.outcome === "saved") {
    return k.dive === 0
      ? { x: ball.x, height: ball.height }
      : { x: Math.sign(ball.x) * Math.min(KEEPER_REACH, Math.abs(ball.x)), height: ball.height };
  }
  return k.dive === 0 ? { x: 0, height: 1.35 } : { x: k.dive * KEEPER_REACH, height: 0.35 + k.diveHeight * 1.9 };
}

/** Where he stands before the kick: on his line, upright, hands ready. */
const SET_HAND_HEIGHT = 1.3;

export interface KeeperPose {
  /** Screen position of his boots — off the ground while he is in the air. */
  readonly feet: Projected;
  /** Screen position of his gloves. */
  readonly hands: Projected;
  /** Metres his boots are off the ground, for the shadow underneath him. */
  readonly air: number;
}

/**
 * His posture at progress `p` (0 = set on his line, 1 = landed).
 *
 * He commits as the taker strikes it and is down at about the moment the ball
 * arrives: a dive that finished early would look like a guess, one that finished
 * late like slow motion. In between he is genuinely airborne — the boots leave
 * the ground and come back down, and the hands travel on an arc rather than
 * sliding along a straight line.
 */
export function keeperPose(k: PenaltyKick, p: number): KeeperPose {
  const target = keeperTarget(k);
  const t = easeInOut(clamp((p - 0.05) / 0.7, 0, 1));
  const air = k.dive === 0 ? 0 : Math.sin(Math.PI * t) * 0.42;
  const handHeight = lerp(SET_HAND_HEIGHT, target.height, t) + Math.sin(Math.PI * t) * (k.dive === 0 ? 0.06 : 0.22);
  return {
    feet: project(lerp(0, k.dive * 0.42, t), air, 0),
    hands: project(lerp(0, target.x, t), handHeight, 0),
    air,
  };
}

export interface BallPose {
  readonly pos: Projected;
  readonly shadow: Projected;
  /** 0 before it's struck … 1 on arrival — also drives the spin. */
  readonly travel: number;
}

/** The ball at progress `p`: it leaves late and fast, and shrinks as it goes. */
export function ballPose(k: PenaltyKick, p: number): BallPose {
  const end = ballPoint(k);
  const travel = easeOut(clamp((p - 0.08) / 0.62, 0, 1));
  const from = project(0, BALL_R, SPOT_DEPTH);
  const to = project(end.x, end.height, 0);
  const shFrom = project(0, 0, SPOT_DEPTH);
  const shTo = project(end.x, 0, 0);
  const at = (a: Projected, b: Projected): Projected => ({ x: lerp(a.x, b.x, travel), y: lerp(a.y, b.y, travel), s: lerp(a.s, b.s, travel) });
  return { pos: at(from, to), shadow: at(shFrom, shTo), travel };
}
