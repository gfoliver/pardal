import type { RandomSource } from "@fut/engine";
import { BALL, KINEMATICS, TEMPO } from "../config.js";
import { clampToPitch, FIELD, type SideDir } from "../field.js";
import { add, clamp, limit, norm, pointToSegment, rotateToward, scale, sub, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";

/** Outcomes the ball resolution can hand back to the match orchestrator. */
export interface BallResolution {
  goalFor?: string; // team that scored
  outOfPlay?: boolean;
}

/**
 * Camada Física — integrates motion under real constraints (acceleration,
 * top-speed and turn-rate caps → inertia) and resolves the ball each physics
 * substep: rolling friction, swept collision (no tunnelling), reception,
 * interception, keeper saves and goal/out-of-play detection.
 */
export class Physics {
  constructor(
    private readonly state: GameState,
    private readonly rng: RandomSource,
  ) {}

  /** Integrate every agent's velocity/position toward its desired velocity. */
  integrateAgents(dt: number): void {
    for (const a of this.state.agents) {
      const steer = limit(sub(a.desiredVel, a.vel), a.accel * dt);
      let vel = add(a.vel, steer);
      // Turn-rate cap: heading can't snap around instantly (bodily inertia).
      vel = rotateToward(a.vel, vel, KINEMATICS.turnRate * dt);
      vel = limit(vel, a.maxSpeed);
      a.vel = vel;
      a.pos = clampToPitch(add(a.pos, scale(vel, dt)));
      if (a.controlTimer > 0) a.controlTimer = Math.max(0, a.controlTimer - dt);
    }
  }

  /** Resolve the ball for this substep. */
  integrateBall(dt: number): BallResolution {
    const ball = this.state.ball;
    if (ball.ownerId) {
      const carrier = this.state.agent(ball.ownerId);
      if (carrier) {
        const facing = carrier.speed > 0.5 ? carrier.vel : { x: carrier.dir, y: 0 };
        ball.attachTo(carrier.pos, facing);
      }
      return {};
    }

    const prev = ball.roll(dt);
    const next = ball.pos;

    // 1) Goal-line crossings (with a keeper save chance for live shots).
    const goal = this.checkGoalLines(prev, next);
    if (goal) return goal;

    // 2) Reception / interception along the swept path.
    if (this.checkReception(prev, next)) return {};

    // 3) Out of play.
    if (next.x < 0 || next.x > FIELD.LENGTH || next.y < 0 || next.y > FIELD.WIDTH) {
      return { outOfPlay: true };
    }
    return {};
  }

  private checkGoalLines(prev: Vec2, next: Vec2): BallResolution | null {
    const ball = this.state.ball;
    for (const dir of [1, -1] as SideDir[]) {
      const lineX = dir === 1 ? FIELD.LENGTH : 0;
      const crossed = dir === 1 ? prev.x < lineX && next.x >= lineX : prev.x > lineX && next.x <= lineX;
      if (!crossed) continue;
      const t = (lineX - prev.x) / (next.x - prev.x || 1e-6);
      const yc = prev.y + (next.y - prev.y) * t;
      if (yc < FIELD.GOAL_Y0 || yc > FIELD.GOAL_Y1) return { outOfPlay: true }; // wide/over
      // Defending keeper gets a save chance at the line.
      const defTeam = dir === 1 ? this.state.awayId : this.state.homeId;
      const gk = this.state.teamAgents(defTeam).find((a) => a.isGK);
      if (gk) {
        const reach = 2.6 + gk.reflexes * 2.2; // covers most of the goal from a central start
        const seg = pointToSegment(gk.pos, prev, next);
        const saveP = Math.max(0.25, Math.min(0.94, 0.72 + gk.reflexes * 0.2 - ball.speed * 0.005));
        if (seg.dist < reach && this.rng.chance(saveP)) {
          // A save is more often PARRIED than caught — powerful shots especially.
          // Parries spill back into play (rebound) or are tipped behind (corner).
          const catchP = clamp(0.42 + gk.handling * 0.4 - ball.speed * 0.014, 0.12, 0.85);
          ball.lastTouchTeamId = defTeam;
          if (this.rng.chance(catchP)) {
            ball.pos = { ...gk.pos };
            this.state.giveBall(gk, TEMPO.firstTouch); // clean catch, keeper holds
            return {};
          }
          if (this.rng.chance(0.4)) {
            // tipped behind → corner (keeper was the last touch).
            ball.pos = { x: lineX + (dir === 1 ? -0.5 : 0.5), y: yc < FIELD.WIDTH / 2 ? FIELD.GOAL_Y0 - 1 : FIELD.GOAL_Y1 + 1 };
            ball.vel = { x: 0, y: 0 };
            ball.ownerId = null;
            ball.clearFlightMeta();
            return { outOfPlay: true };
          }
          // parried back into play → a loose rebound in front of goal.
          ball.pos = { ...gk.pos };
          ball.ownerId = null;
          ball.clearFlightMeta();
          const into = dir === 1 ? 1 : -1; // away from this goal line, into the field
          const spd = 7 + this.rng.next() * 7;
          ball.vel = { x: into * spd, y: (this.rng.next() - 0.5) * spd * 1.5 };
          return {};
        }
      }
      const scoringTeam = dir === 1 ? this.state.homeId : this.state.awayId;
      return { goalFor: scoringTeam };
    }
    return null;
  }

  private checkReception(prev: Vec2, next: Vec2): boolean {
    const ball = this.state.ball;
    // A just-released ball is protected until it clears the passer's immediate
    // area, so a pressing defender standing on the passer can't intercept it
    // point-blank — the pass beats the near man.
    if (ball.releaserId && Math.hypot(next.x - ball.releaseFrom.x, next.y - ball.releaseFrom.y) < BALL.launchProtect) {
      return false;
    }
    let best: PlayerAgent | null = null;
    let bestD = Infinity;
    for (const a of this.state.agents) {
      if (a.id === ball.releaserId) continue;
      // A live shot is saved at the line, not auto-claimed by keeper proximity.
      if (ball.isShot && a.isGK) continue;
      const reach =
        a.id === ball.intendedReceiverId
          ? BALL.receiverRadius
          : a.isGK
            ? 2.2
            : a.teamId === ball.pendingTeamId
              ? BALL.controlRadius + 0.3
              : BALL.controlRadius;
      const seg = pointToSegment(a.pos, prev, next);
      if (seg.dist < reach && seg.dist < bestD) {
        bestD = seg.dist;
        best = a;
      }
    }
    if (!best) return false;
    // A shot passing a defender is only sometimes blocked (else it plays on).
    if (ball.isShot && !best.isGK) {
      if (!this.rng.chance(0.45)) return false;
    }
    ball.pos = { ...best.pos };
    this.state.giveBall(best, TEMPO.firstTouch);
    return true;
  }

  /** Helper for the carrier's facing used elsewhere. */
  static facingOf(a: PlayerAgent): Vec2 {
    return a.speed > 0.5 ? norm(a.vel) : { x: a.dir, y: 0 };
  }
}
