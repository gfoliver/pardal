import { MatchEventType, type RandomSource } from "@fut/engine";
import { AERIAL, AIR, BALL, KINEMATICS, TEMPO } from "../config.js";
import { attackGoal, clampToPitch, FIELD, inAttackingBox, type SideDir } from "../field.js";
import { add, clamp, dist, limit, norm, pointToSegment, rotateToward, scale, sub, type Vec2 } from "../math.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";

/** Outcomes the ball resolution can hand back to the match orchestrator. */
export interface BallResolution {
  goalFor?: string; // team that scored
  outOfPlay?: boolean;
  /** An offside was flagged: indirect free kick to `defendingTeam` at `at`. */
  offside?: { defendingTeam: string; at: Vec2 };
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

    // 2) Reception / interception along the swept path (may flag offside).
    const rec = this.checkReception(prev, next);
    if (rec) return rec;

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
      if (yc < FIELD.GOAL_Y0 || yc > FIELD.GOAL_Y1) return { outOfPlay: true }; // wide
      if (ball.z >= AIR.crossbar) return { outOfPlay: true }; // over the bar
      // Defending keeper gets a save chance at the line.
      const defTeam = dir === 1 ? this.state.awayId : this.state.homeId;
      const gk = this.state.teamAgents(defTeam).find((a) => a.isGK);
      if (gk && ball.z < AIR.keeperReach) {
        // Effective save reach. A keeper sits ~3 m off its line, which eats into
        // its lateral cover (that depth is part of the keeper→shot distance), so
        // the reach must be generous enough that a well-positioned keeper still
        // covers a placed shot into the corner — otherwise on-target shots sail
        // in with no save even attempted. Scales with reflexes.
        const reach = 5.0 + gk.reflexes * 3.4;
        const seg = pointToSegment(gk.pos, prev, next);
        const saveP = Math.max(0.3, Math.min(0.95, 0.78 + gk.reflexes * 0.2 - ball.speed * 0.005));
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
          if (this.rng.chance(0.6)) {
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
      const inRange =
        !!gk && ball.z < AIR.keeperReach && pointToSegment(gk.pos, prev, next).dist < 2.6 + gk.reflexes * 2.2;
      if (inRange) this.state.telemetry.goalKeeperInRange += 1;
      else this.state.telemetry.goalKeeperOut += 1;
      if (gk) this.state.telemetry.goalKeeperAdvanceSum += Math.abs(gk.pos.x - lineX); // how far off its line the keeper was
      const scoringTeam = dir === 1 ? this.state.homeId : this.state.awayId;
      return { goalFor: scoringTeam };
    }
    return null;
  }

  private checkReception(prev: Vec2, next: Vec2): BallResolution | null {
    const ball = this.state.ball;
    // A just-released ball is protected until it clears the passer's immediate
    // area, so a pressing defender standing on the passer can't intercept it
    // point-blank — the pass beats the near man.
    if (ball.releaserId && Math.hypot(next.x - ball.releaseFrom.x, next.y - ball.releaseFrom.y) < BALL.launchProtect) {
      return null;
    }
    // A ball flying above the keeper's reach sails over everyone.
    if (ball.z > AIR.keeperReach) return null;
    // A ball dropping through header height is contested IN THE AIR (a header),
    // not collected at the feet — this is what turns a cross into a duel. Live
    // shots are left to the goal-line/keeper logic.
    if (ball.z > AERIAL.headMin && !ball.isShot) return this.resolveAerial(prev, next);
    let best: PlayerAgent | null = null;
    let bestD = Infinity;
    for (const a of this.state.agents) {
      if (a.id === ball.releaserId) continue;
      // A live shot is saved at the line, not auto-claimed by keeper proximity.
      if (ball.isShot && a.isGK) continue;
      // Can this player reach the ball at its current height?
      if (ball.z > (a.isGK ? AIR.keeperReach : AIR.reach)) continue;
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
    if (!best) return null;
    // A shot passing a defender is only sometimes blocked (else it plays on).
    if (ball.isShot && !best.isGK) {
      if (!this.rng.chance(0.45)) return null;
    }
    // OFFSIDE: a flagged team-mate receiving the pass is caught offside.
    if (best.teamId === ball.pendingTeamId && ball.offsideFlag.includes(best.id)) {
      return { offside: { defendingTeam: this.state.otherTeam(best.teamId), at: { ...best.pos } } };
    }
    ball.pos = { ...best.pos };
    this.state.giveBall(best, TEMPO.firstTouch);
    return {}; // reception handled — no special outcome
  }

  /**
   * Resolve a ball dropping through header height as an AERIAL DUEL. Contenders
   * are whoever can get up to the ball near its path; the winner is decided by
   * closeness + aerial ability (the keeper springs highest in its own area).
   * The winner then heads it — a shot, a defensive clearance, or a knock-down.
   */
  private resolveAerial(prev: Vec2, next: Vec2): BallResolution | null {
    const ball = this.state.ball;
    const contenders: { a: PlayerAgent; d: number }[] = [];
    for (const a of this.state.agents) {
      if (a.id === ball.releaserId) continue;
      const cap = a.isGK ? AIR.keeperReach : AERIAL.jumpReach;
      if (ball.z > cap) continue; // can't reach this high
      const seg = pointToSegment(a.pos, prev, next);
      // A keeper commands a wider radius (it uses its hands and comes to punch/catch).
      const contestR = a.isGK ? AERIAL.radius * 2.2 : AERIAL.radius;
      if (seg.dist < contestR) contenders.push({ a, d: seg.dist });
    }
    if (contenders.length === 0) return null; // no one up to it → flies on

    let winner = contenders[0]!.a;
    let bestScore = -Infinity;
    for (const { a, d } of contenders) {
      const contestR = a.isGK ? AERIAL.radius * 2.2 : AERIAL.radius;
      const prox = 1 - d / contestR; // 0..1 closeness to the ball
      let jump = a.isGK ? 0.9 : a.aerial;
      if (a.isGK) {
        // Command of the area: the closer the ball drops to its own goal, the
        // more dominant the keeper is at claiming it (peaks in the 6-yard box).
        const ownGoalX = a.dir === 1 ? 0 : FIELD.LENGTH;
        const nearGoal = 1 - clamp(Math.abs(next.x - ownGoalX) / FIELD.PENALTY_DEPTH, 0, 1);
        jump = 0.9 + nearGoal * 0.6;
      }
      const attacksBall = a.id === ball.intendedReceiverId ? 0.18 : 0; // the crossed-to runner times the leap
      const score = prox * 0.55 + jump * 0.45 + attacksBall + this.rng.next() * 0.25;
      if (score > bestScore) {
        bestScore = score;
        winner = a;
      }
    }
    // OFFSIDE: a flagged attacker winning the header (a cross/through drilled to
    // an offside runner) is caught offside instead.
    if (winner.teamId === ball.pendingTeamId && ball.offsideFlag.includes(winner.id)) {
      return { offside: { defendingTeam: this.state.otherTeam(winner.teamId), at: { ...winner.pos } } };
    }
    if (new Set(contenders.map((c) => c.a.teamId)).size > 1) this.state.telemetry.aerialDuel += 1;
    this.state.telemetry.header += 1;
    ball.lastTouchTeamId = winner.teamId;
    this.header(winner);
    return {};
  }

  /** Route a won header to a shot, a clearance or a controlled knock-down. */
  private header(winner: PlayerAgent): void {
    const ball = this.state.ball;
    ball.clearFlightMeta();
    ball.ownerId = null;
    ball.pos = { ...winner.pos };

    // A keeper that climbs highest CLAIMS the cross.
    if (winner.isGK) {
      this.state.telemetry.keeperClaim += 1;
      this.state.giveBall(winner, TEMPO.firstTouch);
      return;
    }

    const goal = attackGoal(winner.dir);
    const gDist = dist(winner.pos, goal);
    const ownDist = dist(winner.pos, { x: winner.dir === 1 ? 0 : FIELD.LENGTH, y: FIELD.WIDTH / 2 });
    const central = Math.abs(winner.pos.y - FIELD.WIDTH / 2) < FIELD.GOAL_AREA_WIDTH;

    // Heading position in front of goal (anywhere central in the box) → a
    // header at goal.
    if (inAttackingBox(winner.pos, winner.dir) && gDist < FIELD.PENALTY_DEPTH && central) {
      this.headerShot(winner, goal, gDist);
      return;
    }
    // Near own goal (defending a cross/corner) → a header clearance.
    if (ownDist < 35) {
      this.headerClear(winner);
      return;
    }
    // Otherwise → nod it down into control.
    this.state.giveBall(winner, TEMPO.firstTouch);
  }

  private headerShot(header: PlayerAgent, goal: Vec2, gDist: number): void {
    const s = this.state;
    const ball = s.ball;
    s.statsFor(header.teamId).shots += 1;
    s.telemetry.headerShot += 1;
    s.tallyShotDistance(gDist);
    // Headers are markedly less accurate than a foot shot.
    const finish = header.finishing * 0.5 + header.composure * 0.3 + header.aerial * 0.2;
    const onTargetP = clamp(0.22 + finish * 0.22 - gDist * 0.008, 0.08, 0.5);
    const onTarget = this.rng.chance(onTargetP);
    let targetY: number;
    if (onTarget) {
      s.statsFor(header.teamId).shotsOnTarget += 1;
      targetY = clamp(goal.y + (this.rng.next() - 0.5) * (FIELD.GOAL_WIDTH - 0.8), FIELD.GOAL_Y0 + 0.4, FIELD.GOAL_Y1 - 0.4);
    } else {
      const side = this.rng.next() < 0.5 ? -1 : 1;
      targetY = goal.y + side * (FIELD.GOAL_WIDTH / 2 + 0.8 + this.rng.next() * 3);
    }
    const aim: Vec2 = { x: goal.x, y: targetY };
    ball.launch(scale(norm(sub(aim, header.pos)), AERIAL.headerShotSpeed), header.id, header.teamId, { shot: true });
    ball.vz = -1.5; // headed DOWN toward goal (stays under the bar)
    s.events.push({
      minute: Math.floor(s.clock / 60),
      type: MatchEventType.Shot,
      teamId: header.teamId,
      playerId: header.id,
      playerName: header.player.name,
      params: { onTarget, header: true },
    });
  }

  private headerClear(defender: PlayerAgent): void {
    const s = this.state;
    const ball = s.ball;
    s.telemetry.headerClear += 1;
    // Head it away from goal — upfield and toward the nearer touchline, lofted.
    const targetX = clamp(defender.pos.x + defender.dir * 22, 3, FIELD.LENGTH - 3);
    const targetY =
      defender.pos.y < FIELD.WIDTH / 2 ? Math.max(6, defender.pos.y - 12) : Math.min(FIELD.WIDTH - 6, defender.pos.y + 12);
    const aim: Vec2 = { x: targetX, y: targetY };
    const d = dist(defender.pos, aim);
    ball.launch(scale(norm(sub(aim, defender.pos)), AERIAL.clearSpeed), defender.id, defender.teamId, {});
    ball.vz = 0.5 * AIR.gravity * (d / Math.max(AERIAL.clearSpeed, 4)) * 1.1;
  }

  /** Helper for the carrier's facing used elsewhere. */
  static facingOf(a: PlayerAgent): Vec2 {
    return a.speed > 0.5 ? norm(a.vel) : { x: a.dir, y: 0 };
  }
}
