import { BALL } from "../config.js";
import { add, norm, scale, type Vec2 } from "../math.js";

/**
 * The ball as a physical body. Either carried (glued to a player's feet) or
 * free (rolling with friction). Kinematics only — collision/reception/goal
 * detection lives in the physics layer, which has the player context.
 */
export class Ball {
  pos: Vec2 = { x: 52.5, y: 34 };
  vel: Vec2 = { x: 0, y: 0 };

  /** Player currently in possession, or null while the ball is in flight/loose. */
  ownerId: string | null = null;

  /** Metadata for reception logic (set when the ball is released). */
  releaserId: string | null = null; // last player to touch it
  intendedReceiverId: string | null = null; // targeted receiver of a pass
  pendingTeamId: string | null = null; // team that played the current pass
  isShot = false; // a live shot heading at goal (saved at the line, not by proximity)
  releaseFrom: Vec2 = { x: 0, y: 0 };
  lastTouchTeamId: string | null = null;

  get loose(): boolean {
    return this.ownerId === null;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  /** Kick the ball with an initial velocity, marking it in-flight. */
  launch(velocity: Vec2, releaserId: string, teamId: string, opts: { shot?: boolean; receiverId?: string } = {}): void {
    this.vel = velocity;
    this.ownerId = null;
    this.releaserId = releaserId;
    this.lastTouchTeamId = teamId;
    this.pendingTeamId = opts.shot ? null : teamId;
    this.intendedReceiverId = opts.receiverId ?? null;
    this.isShot = opts.shot ?? false;
    this.releaseFrom = { ...this.pos };
  }

  /** Glue the ball to a carrier's feet, led slightly in their facing direction. */
  attachTo(pos: Vec2, facing: Vec2): void {
    this.pos = add(pos, scale(norm(facing), BALL.dribbleAtFeet));
    this.vel = { x: 0, y: 0 };
  }

  /** Apply rolling friction over dt, returning the pre-step position. */
  roll(dt: number): Vec2 {
    const prev = { ...this.pos };
    const s = this.speed;
    if (s > 1e-4) {
      const decel = BALL.friction * dt;
      const factor = s > decel ? (s - decel) / s : 0;
      this.vel = scale(this.vel, factor);
    }
    this.pos = add(this.pos, scale(this.vel, dt));
    return prev;
  }

  clearFlightMeta(): void {
    this.releaserId = null;
    this.intendedReceiverId = null;
    this.pendingTeamId = null;
    this.isShot = false;
  }
}
