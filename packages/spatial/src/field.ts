import { clamp, type Vec2 } from "./math.js";

/**
 * Pitch geometry in metres. Coordinates: x along the length (0 = home goal
 * line, LENGTH = away goal line), y across the width (0..WIDTH). Home attacks
 * toward +x, away toward -x. Origin bottom-left.
 */
export const FIELD = {
  LENGTH: 105,
  WIDTH: 68,
  GOAL_WIDTH: 7.32,
  GOAL_Y0: (68 - 7.32) / 2,
  GOAL_Y1: (68 + 7.32) / 2,
  PENALTY_DEPTH: 16.5,
  PENALTY_WIDTH: 40.32,
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
