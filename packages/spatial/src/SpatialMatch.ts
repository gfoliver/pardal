import {
  DefaultRoleProvider,
  type Player,
  Position,
  positionGroup,
  PositionGroup,
  type RoleMovement,
  type Team,
} from "@fut/domain";
import {
  createTeamStats,
  MatchEventType,
  SeededRandom,
  type MatchEvent,
  type RandomSource,
  type TeamStats,
} from "@fut/engine";
import {
  add,
  clamp,
  dist,
  limit,
  norm,
  pointToSegment,
  scale,
  sub,
  type Vec2,
} from "./math.js";
import {
  attackGoal,
  clampToPitch,
  FIELD,
  inAttackingBox,
  type SideDir,
} from "./field.js";

// ---- Tunables (Phase 1 — plausible, not yet calibrated) --------------------
const DT_DEFAULT = 0.1; // fixed timestep (s) — determinism
const CONTROL_RADIUS = 1.3; // m: distance to gain a loose ball
const TACKLE_RADIUS = 1.6; // m
const DRIBBLE_AT_FEET = 1.0; // m ahead of carrier
const BALL_FRICTION = 7.5; // m/s² deceleration of a rolling ball
const DECISION_EVERY = 0.55; // s between carrier decisions
const TACKLE_COOLDOWN = 1.5; // s between tackle attempts on the carrier

const n = (a: number) => clamp(a / 99, 0.01, 1);

interface Agent {
  player: Player;
  teamId: string;
  dir: SideDir;
  isGK: boolean;
  role: RoleMovement;
  depth: number; // formation depth 0 (own goal) … ~0.9 (striker)
  widthY: number; // pitch y (m) from formation width
  home: Vec2; // kick-off position (compressed into own half)
  pos: Vec2;
  vel: Vec2;
  maxSpeed: number;
  accel: number;
}

export interface SpatialPlayerView {
  id: string;
  teamId: string;
  pos: Position;
  x: number; // 0..100 across (screen horizontal)
  y: number; // 0..100 along (screen vertical; home defends bottom)
  hasBall: boolean;
}

export interface SpatialSnapshot {
  minute: number;
  status: "kickoff" | "playing" | "halftime" | "finished";
  homeScore: number;
  awayScore: number;
  possessionTeamId: string;
  players: SpatialPlayerView[];
  ball: { x: number; y: number };
}

export interface SpatialConfig {
  home: Team;
  away: Team;
  seed: number;
  regulationMinutes?: number;
}

const roleFallback = new DefaultRoleProvider();

/**
 * Continuous, spatial match engine (metres, fixed-timestep, seeded → fully
 * reproducible). Players and the ball have real positions and velocities;
 * decisions (pass/shoot/dribble/tackle) are grounded in geometry. Built for the
 * WATCHED match; the abstract zone engine (@fut/engine) still serves quick sim.
 */
export class SpatialMatch {
  private readonly rng: RandomSource;
  private readonly agents: Agent[] = [];
  private readonly byTeam: Record<string, Agent[]> = {};
  private readonly homeId: string;
  private readonly awayId: string;
  private readonly names: Record<string, string> = {};
  private readonly regulation: number;

  private ball: Vec2 = { ...FIELD.CENTRE };
  private ballVel: Vec2 = { x: 0, y: 0 };
  private ownerId: string | null = null; // null → loose / in flight
  private possessionTeamId: string;
  private releaserId: string | null = null; // player who just kicked it
  private releaseFrom: Vec2 = { x: 0, y: 0 };

  private clock = 0; // seconds
  private _status: SpatialSnapshot["status"] = "kickoff";
  private secondHalfKicked = false;
  private decisionTimer = 0;
  private tackleCd = 0;
  private lastTouchTeamId: string;

  readonly score = { home: 0, away: 0 };
  readonly stats: { home: TeamStats; away: TeamStats };
  readonly events: MatchEvent[] = [];

  constructor(config: SpatialConfig) {
    this.rng = new SeededRandom(config.seed);
    this.homeId = config.home.id;
    this.awayId = config.away.id;
    this.regulation = config.regulationMinutes ?? 90;
    this.stats = { home: createTeamStats(), away: createTeamStats() };
    this.possessionTeamId = this.homeId;
    this.lastTouchTeamId = this.homeId;

    this.byTeam[this.homeId] = [];
    this.byTeam[this.awayId] = [];
    this.buildTeam(config.home, 1);
    this.buildTeam(config.away, -1);
    this.resetFormation(this.homeId);
    this.events.push({ minute: 0, type: MatchEventType.Kickoff, teamId: this.homeId });
    this.giveBallToKickoffTaker(this.homeId);
  }

  private buildTeam(team: Team, dir: SideDir): void {
    const ownGoalX = dir === 1 ? 0 : FIELD.LENGTH;
    for (const p of team.startingXi) {
      const slot = team.tactics.baseSlot(p.id);
      const depth = slot ? slot.depth : 0.1;
      const width = slot ? slot.width : 0.5;
      const widthY = dir === 1 ? width * FIELD.WIDTH : FIELD.WIDTH - width * FIELD.WIDTH;
      // Kick-off position: whole formation compressed into its own half.
      const home: Vec2 = { x: ownGoalX + dir * (0.06 + depth * 0.44) * FIELD.LENGTH, y: widthY };
      const role = team.tactics.roleFor(p.id) ?? roleFallback.defaultRoleFor(p.position);
      const pace = n(p.physical.pace);
      const agent: Agent = {
        player: p,
        teamId: team.id,
        dir,
        isGK: p.position === Position.Goalkeeper,
        role: role.movement,
        depth,
        widthY,
        home,
        pos: { ...home },
        vel: { x: 0, y: 0 },
        maxSpeed: 6.2 + pace * 2.6, // ~6.2–8.8 m/s
        accel: 7 + pace * 3,
      };
      this.agents.push(agent);
      this.byTeam[team.id]!.push(agent);
      this.names[p.id] = p.name;
    }
  }

  // ---- Public driving ------------------------------------------------------
  get finished(): boolean {
    return this._status === "finished";
  }
  get minute(): number {
    return Math.min(this.regulation, Math.floor(this.clock / 60) + (this.clock > 0 ? 0 : 0));
  }

  /** Advance one fixed timestep. Returns events produced this tick. */
  tick(dt: number = DT_DEFAULT): MatchEvent[] {
    if (this._status === "finished") return [];
    const before = this.events.length;

    // Kick-off transitions.
    if (this._status === "kickoff") this._status = "playing";
    this.clock += dt;
    const minute = Math.floor(this.clock / 60);
    if (!this.secondHalfKicked && minute >= this.regulation / 2) {
      this.events.push({ minute: this.regulation / 2, type: MatchEventType.HalfTime });
      this.secondHalfKicked = true;
      this.resetFormation(this.awayId);
      this.giveBallToKickoffTaker(this.awayId);
    }
    if (minute >= this.regulation) {
      this.events.push({ minute: this.regulation, type: MatchEventType.FullTime });
      this._status = "finished";
      return this.events.slice(before);
    }

    this.statsFor(this.possessionTeamId).possessionSteps += 1;
    this.moveAgents(dt);
    this.updateBall(dt);
    this.decisionTimer += dt;
    if (this.ownerId && this.decisionTimer >= DECISION_EVERY) {
      this.decisionTimer = 0;
      this.carrierDecision();
    }
    if (this.tackleCd > 0) this.tackleCd -= dt;
    this.contest();

    return this.events.slice(before);
  }

  // ---- Movement ------------------------------------------------------------
  private chasers = new Set<string>();
  private pressers = new Set<string>();
  private markAssign = new Map<string, string>(); // defenderId → attackerId
  private markTimer = 0;
  private coverId: string | null = null; // defender covering behind the presser
  private passReceiverId: string | null = null; // intended receiver of a pass in flight

  private moveAgents(dt: number): void {
    // Loose ball → nearest player of each team pursues it.
    this.chasers.clear();
    this.pressers.clear();
    if (!this.ownerId) {
      for (const teamId of [this.homeId, this.awayId]) {
        const near = this.nearestOfTeam(teamId, this.ball);
        if (near) this.chasers.add(near.player.id);
      }
      // The intended receiver always runs onto a pass in flight.
      if (this.passReceiverId) this.chasers.add(this.passReceiverId);
    } else {
      // Owned → the defending team presses the carrier and marks the rest.
      const carrier = this.agentById(this.ownerId);
      if (carrier) {
        const defTeamId = carrier.teamId === this.homeId ? this.awayId : this.homeId;
        let presser: Agent | null = null;
        let bd = Infinity;
        for (const o of this.byTeam[defTeamId]!) {
          if (o.isGK) continue;
          const d = dist(o.pos, carrier.pos);
          if (d < bd) {
            bd = d;
            presser = o;
          }
        }
        if (presser) this.pressers.add(presser.player.id);
        // Cover: the 2nd-nearest outfielder drops behind the presser.
        this.coverId = null;
        let cd = Infinity;
        for (const o of this.byTeam[defTeamId]!) {
          if (o.isGK || o.player.id === presser?.player.id) continue;
          const d = dist(o.pos, carrier.pos);
          if (d < cd) {
            cd = d;
            this.coverId = o.player.id;
          }
        }
        this.markTimer -= dt;
        if (this.markTimer <= 0) {
          this.computeMarking(carrier, defTeamId, presser, this.coverId);
          this.markTimer = 0.4;
        }
      }
    }
    if (!this.ownerId) {
      this.markAssign.clear();
      this.coverId = null;
    }
    for (const a of this.agents) {
      const target = this.desiredPosition(a);
      const toTarget = sub(target, a.pos);
      const d = Math.hypot(toTarget.x, toTarget.y);
      // Arrive: ease within 2 m.
      const speed = a.maxSpeed * (d < 2 ? d / 2 : 1);
      const desiredVel = scale(norm(toTarget), speed);
      let steer = limit(sub(desiredVel, a.vel), a.accel * dt);
      // Separation from close teammates.
      const sep = this.separation(a);
      steer = add(steer, scale(sep, dt));
      a.vel = limit(add(a.vel, steer), a.maxSpeed);
      a.pos = clampToPitch(add(a.pos, scale(a.vel, dt)));
    }
  }

  private separation(a: Agent): Vec2 {
    let push: Vec2 = { x: 0, y: 0 };
    for (const b of this.byTeam[a.teamId]!) {
      if (b === a) continue;
      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9 && d2 > 1e-3) {
        const f = (3 - Math.sqrt(d2)) * 3;
        push = add(push, scale(norm({ x: dx, y: dy }), f));
      }
    }
    return push;
  }

  /** Where an agent wants to be this instant, from role + phase + ball. */
  private desiredPosition(a: Agent): Vec2 {
    if (a.isGK) return this.keeperTarget(a);
    const attacking = this.possessionTeamId === a.teamId;
    const goal = attackGoal(a.dir);
    let t: Vec2 = { ...a.home };

    // Chase a loose ball (lead it slightly by its velocity).
    if (!this.ownerId && this.chasers.has(a.player.id)) {
      return clampToPitch({ x: this.ball.x + this.ballVel.x * 0.25, y: this.ball.y + this.ballVel.y * 0.25 });
    }
    // Close down the ball carrier when defending.
    if (this.pressers.has(a.player.id) && this.ownerId) {
      const c = this.agentById(this.ownerId);
      if (c) return clampToPitch({ x: c.pos.x + c.vel.x * 0.2, y: c.pos.y + c.vel.y * 0.2 });
    }
    // Cover: sit ~8 m goal-side of the carrier, protecting the space behind the presser.
    if (this.coverId === a.player.id && this.ownerId) {
      const c = this.agentById(this.ownerId);
      if (c) return clampToPitch({ x: c.pos.x - a.dir * 8, y: c.pos.y * 0.6 + (FIELD.WIDTH / 2) * 0.4 });
    }
    // Mark your man: sit ~2.3 m goal-side of the assigned attacker.
    const markId = this.markAssign.get(a.player.id);
    if (markId) {
      const att = this.agentById(markId);
      if (att) {
        const lead = { x: att.pos.x + att.vel.x * 0.2, y: att.pos.y + att.vel.y * 0.2 };
        return clampToPitch({ x: lead.x - a.dir * 2.3, y: lead.y });
      }
    }

    // The ball carrier drives toward their dribble target (goal / space).
    if (a.player.id === this.ownerId) {
      const dr = this.dribbleTarget ?? goal;
      return { x: clamp(dr.x, 1, FIELD.LENGTH - 1), y: clamp(dr.y, 1, FIELD.WIDTH - 1) };
    }

    // Compact team block that slides up/down the pitch with the ball. Players
    // hold their formation depth RELATIVE to the block (≈42 m long), so the
    // team stays connected instead of spanning the whole pitch.
    const ownGoalX = a.dir === 1 ? 0 : FIELD.LENGTH;
    const ballProg = a.dir === 1 ? this.ball.x / FIELD.LENGTH : (FIELD.LENGTH - this.ball.x) / FIELD.LENGTH;
    const lineDist = clamp(13 + ballProg * 27 + (attacking ? 3 : -7), 9, 44);
    const defLineX = ownGoalX + a.dir * lineDist;
    const TEAM_LENGTH = 30;
    const depthFrac = clamp((a.depth - 0.16) / (0.85 - 0.16), 0, 1.15);
    t.x = defLineX + a.dir * depthFrac * TEAM_LENGTH * (attacking ? 1 : 0.9);

    // Lateral: hold formation width, drift toward the ball's channel.
    const track = attacking ? 0.15 + a.role.widthBias * 0.12 : 0.32 + a.role.defensiveBias * 0.12;
    t.y = a.widthY + (this.ball.y - a.widthY) * track;

    // Keep attackers onside (never beyond the last defender).
    if (attacking) {
      const line = this.lastDefenderLine(a);
      t.x = a.dir === 1 ? Math.min(t.x, line) : Math.max(t.x, line);
    }
    t.x = clamp(t.x, 1, FIELD.LENGTH - 1);
    t.y = clamp(t.y, 1, FIELD.WIDTH - 1);
    void goal;
    return t;
  }

  /**
   * Assign defenders to mark opposing attackers: most dangerous attacker (nearest
   * to the goal being defended) → nearest free defender. The presser and both
   * keepers are excluded; spare defenders hold their zone.
   */
  private computeMarking(carrier: Agent, defTeamId: string, presser: Agent | null, coverId: string | null): void {
    this.markAssign.clear();
    // defTeam's own goal = opposite of their attack dir.
    const defDir = this.byTeam[defTeamId]![0]!.dir;
    const goalX = defDir === 1 ? 0 : FIELD.LENGTH;

    const attackers = this.byTeam[carrier.teamId]!
      .filter((a) => a !== carrier && !a.isGK)
      .sort((a, b) => Math.abs(a.pos.x - goalX) - Math.abs(b.pos.x - goalX)); // closest to our goal first
    const defenders = this.byTeam[defTeamId]!.filter(
      (d) => !d.isGK && d.player.id !== presser?.player.id && d.player.id !== coverId,
    );
    const used = new Set<string>();
    for (const att of attackers) {
      let pick: Agent | null = null;
      let bd = Infinity;
      for (const d of defenders) {
        if (used.has(d.player.id)) continue;
        const dd = dist(d.pos, att.pos);
        if (dd < bd) {
          bd = dd;
          pick = d;
        }
      }
      if (!pick) break;
      used.add(pick.player.id);
      this.markAssign.set(pick.player.id, att.player.id);
    }
  }

  /** Approx offside/last-line cap so attackers don't camp in the goal. */
  private lastDefenderLine(a: Agent): number {
    const opp = this.byTeam[a.teamId === this.homeId ? this.awayId : this.homeId]!;
    let line = a.dir === 1 ? -Infinity : Infinity;
    for (const d of opp) {
      if (a.dir === 1) line = Math.max(line, d.pos.x);
      else line = Math.min(line, d.pos.x);
    }
    // Allow up to the last defender.
    return a.dir === 1 ? Math.min(FIELD.LENGTH - 2, line + 1) : Math.max(2, line - 1);
  }

  private keeperTarget(a: Agent): Vec2 {
    const goalX = a.dir === 1 ? 0 : FIELD.LENGTH;
    const y = clamp(FIELD.WIDTH / 2 + (this.ball.y - FIELD.WIDTH / 2) * 0.4, FIELD.GOAL_Y0 - 2, FIELD.GOAL_Y1 + 2);
    // Come off the line a little when the ball is near.
    const off = Math.max(0, 6 - dist(this.ball, { x: goalX, y }) / 6);
    return { x: goalX + a.dir * (2 + off), y };
  }

  // ---- Ball ----------------------------------------------------------------
  private updateBall(dt: number): void {
    if (this.ownerId) {
      const o = this.agentById(this.ownerId);
      if (o) {
        const facing = Math.hypot(o.vel.x, o.vel.y) > 0.5 ? norm(o.vel) : { x: o.dir, y: 0 };
        this.ball = add(o.pos, scale(facing, DRIBBLE_AT_FEET));
        this.ballVel = { ...o.vel };
      }
      return;
    }
    // In flight / loose: integrate with friction along a SWEPT segment so a
    // fast ball can't tunnel past players/keeper/goal between ticks.
    const prev = this.ball;
    const next = add(prev, scale(this.ballVel, dt));
    const sp = Math.hypot(this.ballVel.x, this.ballVel.y);
    const nsp = Math.max(0, sp - BALL_FRICTION * dt);
    this.ballVel = sp > 1e-3 ? scale(this.ballVel, nsp / sp) : { x: 0, y: 0 };

    if (this.releaserId && dist(next, this.releaseFrom) >= 3.5) this.releaserId = null;

    // Goal line crossings (with a keeper save chance).
    for (const dir of [1, -1] as SideDir[]) {
      const lineX = dir === 1 ? FIELD.LENGTH : 0;
      const crossed = dir === 1 ? prev.x < lineX && next.x >= lineX : prev.x > lineX && next.x <= lineX;
      if (!crossed) continue;
      const t = (lineX - prev.x) / (next.x - prev.x || 1e-6);
      const yc = prev.y + (next.y - prev.y) * t;
      if (yc < FIELD.GOAL_Y0 || yc > FIELD.GOAL_Y1) continue; // wide/over → out of play below
      const defTeam = dir === 1 ? this.awayId : this.homeId;
      const gk = this.byTeam[defTeam]!.find((a) => a.isGK);
      if (gk) {
        const refl = n((gk.player as { goalkeeping?: { reflexes: number } }).goalkeeping?.reflexes ?? 40);
        const reach = 2.4 + refl * 2.2;
        const seg = pointToSegment(gk.pos, prev, next);
        const shotSpeed = Math.hypot(this.ballVel.x, this.ballVel.y);
        const saveP = clamp(0.74 + refl * 0.24 - shotSpeed * 0.006, 0.3, 0.97);
        if (seg.dist < reach && this.rng.chance(saveP)) {
          this.ball = { x: gk.pos.x, y: gk.pos.y };
          this.gainPossession(gk);
          return;
        }
      }
      this.onGoal(dir === 1 ? this.homeId : this.awayId);
      return;
    }

    // Swept reception. The intended receiver has a generous control radius so a
    // clean pass connects; team-mates collect easily; opponents only intercept a
    // ball that runs genuinely close to them (covered lane). This keeps pass
    // completion realistic instead of a coin-flip.
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of this.agents) {
      if (a.player.id === this.releaserId) continue;
      const reach =
        a.player.id === this.passReceiverId
          ? 2.7
          : a.isGK
            ? 2.2
            : a.teamId === this.pendingPassTeam
              ? 1.6
              : CONTROL_RADIUS;
      const seg = pointToSegment(a.pos, prev, next);
      if (seg.dist < reach && seg.dist < bestD) {
        bestD = seg.dist;
        best = a;
      }
    }
    if (best) {
      this.ball = { ...best.pos };
      this.gainPossession(best);
      return;
    }

    this.ball = next;
    if (next.x < 0 || next.x > FIELD.LENGTH || next.y < 0 || next.y > FIELD.WIDTH) {
      this.restartOutOfPlay();
    }
  }

  // ---- Decisions -----------------------------------------------------------
  private carrierDecision(): void {
    const carrier = this.agentById(this.ownerId!);
    if (!carrier) return;
    const goal = attackGoal(carrier.dir);
    const goalDist = dist(carrier.pos, goal);
    const pressure = this.nearestOpponentDist(carrier);

    // Shoot only from a genuine shooting position (in the box, or close with a
    // sight of goal) — and not every time, to keep shot counts realistic.
    const inBox = inAttackingBox(carrier.pos, carrier.dir);
    const angle = Math.abs(carrier.pos.y - FIELD.WIDTH / 2);
    const goodSight = angle < 14 + goalDist * 0.4;
    // Shoot only on a genuine opening (space + sight), not on every box touch —
    // teams should circulate the ball far more often than they shoot.
    if (inBox && goodSight && pressure > 1.6 && this.rng.chance(0.05)) {
      this.shoot(carrier, goal, goalDist, pressure);
      return;
    }
    if (!inBox && goalDist < 18 && pressure > 4 && goodSight && this.rng.chance(0.03)) {
      this.shoot(carrier, goal, goalDist, pressure);
      return;
    }

    // Recycle possession: pass whenever there's a reasonable option, rather than
    // dribbling through traffic. Only carry the ball when genuinely in space.
    const target = this.bestPass(carrier);
    if (target && (pressure < 8 || target.progress > 0)) {
      this.pass(carrier, target.agent, target.lead);
      return;
    }

    // Otherwise dribble toward goal/space.
    this.dribbleTarget = { x: goal.x, y: clamp(carrier.pos.y + (this.rng.next() - 0.5) * 8, 4, FIELD.WIDTH - 4) };
  }

  private dribbleTarget: Vec2 | null = null;

  private bestPass(carrier: Agent): { agent: Agent; lead: Vec2; progress: number } | null {
    const mates = this.byTeam[carrier.teamId]!.filter((a) => a !== carrier && !a.isGK);
    const opp = this.byTeam[carrier.teamId === this.homeId ? this.awayId : this.homeId]!;
    let best: { agent: Agent; lead: Vec2; progress: number; score: number } | null = null;
    for (const m of mates) {
      const lead = add(m.pos, scale(m.vel, 0.4)); // lead the run
      const d = dist(carrier.pos, lead);
      if (d < 4 || d > 32) continue; // prefer safe, connectable passes
      // Lane blocked?
      let blocked = 0;
      for (const o of opp) {
        const seg = pointToSegment(o.pos, carrier.pos, lead);
        if (seg.dist < 2.2) blocked += 1;
      }
      const progress = carrier.dir * (lead.x - carrier.pos.x);
      const openness = 1 / (1 + blocked * blocked);
      const score = openness * (0.4 + Math.max(0, progress) * 0.06) * (1 - Math.min(1, d / 60));
      if (blocked === 0 || score > 0.25) {
        if (!best || score > best.score) best = { agent: m, lead, progress, score };
      }
    }
    return best;
  }

  private pass(carrier: Agent, receiver: Agent, lead: Vec2): void {
    this.statsFor(carrier.teamId).passes += 1;
    const skill = n(carrier.player.technical.passing) * 0.6 + n(carrier.player.technical.technique) * 0.4;
    const d = dist(carrier.pos, lead);
    const err = (1 - skill) * (0.3 + d * 0.025);
    const target: Vec2 = {
      x: lead.x + (this.rng.next() - 0.5) * err * 2,
      y: lead.y + (this.rng.next() - 0.5) * err * 2,
    };
    const speed = clamp(9 + d * 0.7, 10, 24);
    this.ballVel = scale(norm(sub(target, carrier.pos)), speed);
    this.ownerId = null; // ball in flight
    this.releaserId = carrier.player.id;
    this.releaseFrom = { ...this.ball };
    this.lastTouchTeamId = carrier.teamId;
    this.dribbleTarget = null;
    this.pendingPassTeam = carrier.teamId;
    this.passReceiverId = receiver.player.id;
  }

  private pendingPassTeam: string | null = null;

  private shoot(shooter: Agent, goal: Vec2, goalDist: number, pressure: number): void {
    this.statsFor(shooter.teamId).shots += 1;
    const finish = n(shooter.player.technical.finishing) * 0.6 + n(shooter.player.mental.composure) * 0.4;
    const aimErr = (1 - finish) * (2.5 + goalDist * 0.12) + Math.max(0, (4 - pressure)) * 0.3;
    const targetY = clamp(goal.y + (this.rng.next() - 0.5) * aimErr * 2, FIELD.GOAL_Y0 - 3, FIELD.GOAL_Y1 + 3);
    const onTarget = targetY >= FIELD.GOAL_Y0 && targetY <= FIELD.GOAL_Y1;
    if (onTarget) this.statsFor(shooter.teamId).shotsOnTarget += 1;
    const aim: Vec2 = { x: goal.x, y: targetY };
    this.ballVel = scale(norm(sub(aim, shooter.pos)), 28);
    this.ownerId = null;
    this.releaserId = shooter.player.id;
    this.releaseFrom = { ...this.ball };
    this.lastTouchTeamId = shooter.teamId;
    this.dribbleTarget = null;
    this.pendingPassTeam = null;
    this.passReceiverId = null;
    this.events.push({
      minute: this.minuteNow(),
      type: MatchEventType.Shot,
      teamId: shooter.teamId,
      playerId: shooter.player.id,
      playerName: shooter.player.name,
      params: { onTarget },
    });
    // Keeper save chance handled when the ball nears goal in contest().
  }

  // ---- Possession contests -------------------------------------------------
  private contest(): void {
    if (!this.ownerId || this.tackleCd > 0) return;
    const carrier = this.agentById(this.ownerId);
    if (!carrier) return;
    const opp = this.byTeam[carrier.teamId === this.homeId ? this.awayId : this.homeId]!;
    for (const o of opp) {
      if (dist(o.pos, carrier.pos) <= TACKLE_RADIUS) {
        // At most one tackle attempt per cooldown; pressing mostly FORCES a pass
        // rather than winning the ball outright, so possessions can build.
        this.tackleCd = TACKLE_COOLDOWN;
        const tackle = n(o.player.technical.tackling) * 0.6 + n(o.player.mental.anticipation) * 0.4;
        const evade = n(carrier.player.technical.dribbling) * 0.6 + n(carrier.player.mental.composure) * 0.4;
        if (this.rng.chance(clamp(0.09 + (tackle - evade) * 0.28, 0.02, 0.4))) {
          this.statsFor(o.teamId).tackles += 1;
          this.events.push({
            minute: this.minuteNow(),
            type: MatchEventType.Tackle,
            teamId: o.teamId,
            playerId: o.player.id,
            playerName: o.player.name,
          });
          this.gainPossession(o);
          return;
        }
      }
    }
  }

  private gainPossession(a: Agent): void {
    // Pass completion accounting.
    if (this.pendingPassTeam) {
      if (a.teamId === this.pendingPassTeam) this.statsFor(a.teamId).passesCompleted += 1;
      this.pendingPassTeam = null;
    }
    this.ownerId = a.player.id;
    this.possessionTeamId = a.teamId;
    this.lastTouchTeamId = a.teamId;
    this.ballVel = { x: 0, y: 0 };
    this.passReceiverId = null;
    this.releaserId = null;
    // Keeper claim near goal already handled by proximity.
  }

  // ---- Events / restarts ---------------------------------------------------
  private onGoal(teamId: string): void {
    if (teamId === this.homeId) this.score.home += 1;
    else this.score.away += 1;
    this.statsFor(teamId).goals += 1;
    // Scorer = last touch on that team (approx): nearest attacker to the ball.
    const scorer = this.nearestOfTeam(teamId, this.ball);
    this.events.push({
      minute: this.minuteNow(),
      type: MatchEventType.Goal,
      teamId,
      playerId: scorer?.player.id,
      playerName: scorer?.player.name,
      params: { chanceType: "openPlay" },
    });
    const conceding = teamId === this.homeId ? this.awayId : this.homeId;
    this.resetFormation(conceding);
    this.giveBallToKickoffTaker(conceding);
  }

  private restartOutOfPlay(): void {
    const restartTeam = this.lastTouchTeamId === this.homeId ? this.awayId : this.homeId;
    // Simple: reset ball near where it left, give to the other team.
    this.ball = clampToPitch({ x: clamp(this.ball.x, 3, FIELD.LENGTH - 3), y: clamp(this.ball.y, 3, FIELD.WIDTH - 3) });
    this.ballVel = { x: 0, y: 0 };
    const taker = this.nearestOfTeam(restartTeam, this.ball);
    if (taker) {
      this.possessionTeamId = restartTeam;
      this.gainPossession(taker);
    }
  }

  private giveBallToKickoffTaker(teamId: string): void {
    this.ballVel = { x: 0, y: 0 };
    this.possessionTeamId = teamId;
    const mates = this.byTeam[teamId]!;
    // A midfielder takes it from just inside the team's own half (with space and
    // support) — not an isolated striker on the contested centre spot.
    const taker =
      mates.find((a) => positionGroup(a.player.position) === PositionGroup.Midfield) ??
      mates.find((a) => !a.isGK) ??
      mates[0]!;
    taker.pos = { x: FIELD.CENTRE.x - taker.dir * 9, y: FIELD.CENTRE.y };
    taker.vel = { x: 0, y: 0 };
    this.ball = { x: taker.pos.x, y: taker.pos.y };
    this.ownerId = taker.player.id;
    this.lastTouchTeamId = teamId;
    this.decisionTimer = 0;
    this.dribbleTarget = null;
  }

  private resetFormation(_kickoffTeam: string): void {
    for (const a of this.agents) {
      a.pos = { ...a.home };
      a.vel = { x: 0, y: 0 };
    }
  }

  // ---- Helpers -------------------------------------------------------------
  private agentById(id: string): Agent | undefined {
    return this.agents.find((a) => a.player.id === id);
  }
  private nearestOpponentDist(a: Agent): number {
    const opp = this.byTeam[a.teamId === this.homeId ? this.awayId : this.homeId]!;
    let m = Infinity;
    for (const o of opp) m = Math.min(m, dist(o.pos, a.pos));
    return m;
  }
  private nearestOfTeam(teamId: string, p: Vec2): Agent | undefined {
    let best: Agent | undefined;
    let bd = Infinity;
    for (const a of this.byTeam[teamId]!) {
      const d = dist(a.pos, p);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }
  private statsFor(teamId: string): TeamStats {
    return teamId === this.homeId ? this.stats.home : this.stats.away;
  }
  private minuteNow(): number {
    return clamp(Math.floor(this.clock / 60) + 1, 1, this.regulation);
  }

  // ---- Snapshot ------------------------------------------------------------
  snapshot(): SpatialSnapshot {
    const players: SpatialPlayerView[] = this.agents.map((a) => ({
      id: a.player.id,
      teamId: a.teamId,
      pos: a.player.position,
      x: (a.pos.y / FIELD.WIDTH) * 100,
      y: 100 - (a.pos.x / FIELD.LENGTH) * 100,
      hasBall: a.player.id === this.ownerId,
    }));
    return {
      minute: this.minuteNow(),
      status: this._status,
      homeScore: this.score.home,
      awayScore: this.score.away,
      possessionTeamId: this.possessionTeamId,
      players,
      ball: { x: (this.ball.y / FIELD.WIDTH) * 100, y: 100 - (this.ball.x / FIELD.LENGTH) * 100 },
    };
  }
}
