import { AIR, BALL } from "../config.js";
import { add, norm, scale, type Vec2 } from "../math.js";

/**
 * The ball as a physical body. Either carried (glued to a player's feet) or
 * free (rolling with friction). Kinematics only — collision/reception/goal
 * detection lives in the physics layer, which has the player context.
 *
 * The ball is 2.5D: it moves on the ground plane (x, y) but also has a HEIGHT
 * `z` (metres) and vertical velocity `vz`, so it can be lofted — long balls,
 * chips, crosses — and fly over players who can only reach so high.
 */
export class Ball {
  pos: Vec2 = { x: 52.5, y: 34 };
  vel: Vec2 = { x: 0, y: 0 };
  z = 0; // height above the pitch (m)
  vz = 0; // vertical velocity (m/s)

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

  get airborne(): boolean {
    return this.z > 0.05 || this.vz > 0.1;
  }

  /**
   * Kick the ball with an initial velocity, marking it in-flight. `opts.loft`
   * is the initial upward velocity (0 = a ground ball; >0 arcs it — a lofted
   * pass, cross, chip or long ball).
   */
  launch(velocity: Vec2, releaserId: string, teamId: string, opts: { shot?: boolean; receiverId?: string; loft?: number } = {}): void {
    this.vel = velocity;
    this.vz = opts.loft ?? 0;
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
    this.z = 0;
    this.vz = 0;
  }

  /** Advance the free ball over dt (height + friction), returning pre-step pos. */
  roll(dt: number): Vec2 {
    const prev = { ...this.pos };
    // Vertical: gravity + bounce on landing.
    if (this.airborne) {
      this.vz -= AIR.gravity * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = this.vz < -1 ? -this.vz * AIR.bounce : 0; // bounce, or settle
      }
    }
    // Horizontal: rolling friction on the ground, light drag in the air.
    const s = this.speed;
    if (s > 1e-4) {
      const decel = (this.z <= 0.05 ? BALL.friction : BALL.friction * AIR.drag) * dt;
      const factor = s > decel ? (s - decel) / s : 0;
      this.vel = scale(this.vel, factor);
    }
    this.pos = add(this.pos, scale(this.vel, dt));
    return prev;
  }

  /**
   * Upward velocity so a ball launched at horizontal speed `vh` lands ~`dist`
   * away (projectile from ground to ground). `archScale` >1 gives a higher arc
   * (a chip/lob), <1 a flatter driven ball.
   */
  static loftFor(dist: number, vh: number, archScale = 1): number {
    const t = dist / Math.max(vh, 4); // time of flight
    return 0.5 * AIR.gravity * t * archScale;
  }

  clearFlightMeta(): void {
    this.releaserId = null;
    this.intendedReceiverId = null;
    this.pendingTeamId = null;
    this.isShot = false;
  }
}
