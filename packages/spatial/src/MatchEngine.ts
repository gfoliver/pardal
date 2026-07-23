import { MatchEventType, SeededRandom, type MatchEvent, type RandomSource } from "@fut/engine";
import type { Team } from "@fut/domain";
import { SpatialAnalysis } from "./analysis/SpatialAnalysis.js";
import { BALL, CLOCK, DEADBALL, RATES, TEMPO } from "./config.js";
import { attackGoalX, FIELD } from "./field.js";
import { clamp, dist, norm, scale, sub, type Vec2 } from "./math.js";
import { UtilityAI } from "./decision/UtilityAI.js";
import { MovementSystem } from "./movement/MovementSystem.js";
import { Contest } from "./physics/Contest.js";
import { Physics } from "./physics/Physics.js";
import { ObjectivePlanner } from "./planning/ObjectivePlanner.js";
import { GameState } from "./state/GameState.js";
import type { PlayerAgent } from "./state/PlayerAgent.js";
import { buildProfile, type TacticalProfile } from "./tactics/TacticalProfile.js";
import type { DeadBall, RestartType } from "./types.js";

const PHYS_DT = 1 / RATES.physicsHz;

/**
 * The orchestrator that runs the layered simulation loop at its four cadences:
 *
 *   physics (60 Hz)  → integrate motion + ball
 *   analysis (20 Hz) → rebuild spatial/influence maps + steering targets
 *   decision (10 Hz) → objective planning + utility AI (on-ball action)
 *   strategy (2 Hz)  → collective/tactical review (pressing intensity etc.)
 *
 * It owns the GameState and every layer, and drives the match from kick-off to
 * full time. Fully deterministic from the seed.
 */
export class MatchEngine {
  readonly state: GameState;
  private readonly rng: RandomSource;
  private readonly profiles: Record<string, TacticalProfile>;

  private readonly maps: SpatialAnalysis;
  private readonly planner: ObjectivePlanner;
  private readonly movement: MovementSystem;
  private readonly physics: Physics;
  private readonly contest: Contest;
  private readonly utility: UtilityAI;

  private readonly regulation: number; // seconds
  status: "kickoff" | "playing" | "halftime" | "finished" = "kickoff";
  private secondHalfKicked = false;

  private acc = 0;
  private simTime = 0;
  private analysisAcc = 0;
  private decisionAcc = 0;
  private strategyAcc = 0;

  constructor(home: Team, away: Team, seed: number, regulationMinutes = 90) {
    this.state = new GameState(home, away);
    this.rng = new SeededRandom(seed);
    this.profiles = {
      [home.id]: buildProfile(home.tactics.instructions),
      [away.id]: buildProfile(away.tactics.instructions),
    };
    this.maps = new SpatialAnalysis(this.state);
    this.planner = new ObjectivePlanner(this.state, this.maps, this.profiles);
    this.movement = new MovementSystem(this.state);
    this.physics = new Physics(this.state, this.rng);
    this.contest = new Contest(this.state, this.rng, (fouledTeam, at) => this.onFoul(fouledTeam, at));
    this.utility = new UtilityAI(this.state, this.maps, this.profiles, this.rng);
    this.regulation = regulationMinutes * 60;
    // Tempo → first-touch: a high-tempo side moves the ball quicker.
    for (const id of [home.id, away.id]) {
      this.state.firstTouch[id] = TEMPO.firstTouch * (1.4 - this.profiles[id]!.tempo * 0.8);
    }
    this.startKickoff(this.state.homeId);
    this.maps.rebuild();
  }

  get finished(): boolean {
    return this.status === "finished";
  }
  get events(): readonly MatchEvent[] {
    return this.state.events;
  }
  get stats() {
    return this.state.stats;
  }
  get score() {
    return this.state.score;
  }
  get minute(): number {
    return Math.min(this.regulation / 60, Math.floor(this.state.clock / 60));
  }

  /** Advance the match by `dt` seconds (subdivided into 60 Hz physics steps). */
  tick(dt: number): MatchEvent[] {
    if (this.status === "finished") return [];
    const before = this.state.events.length;
    if (this.status === "kickoff") this.status = "playing";
    this.acc += dt;
    let guard = 0;
    while (this.acc >= PHYS_DT && !this.finished && guard++ < 10_000) {
      this.step(PHYS_DT);
      this.acc -= PHYS_DT;
    }
    return this.state.events.slice(before);
  }

  private step(h: number): void {
    const s = this.state;
    const dead = s.deadBall;
    // The ball is not in play at a kick-off until it is played — the clock only
    // starts once the kick-off is taken. The clock is scaled (see CLOCK) so the
    // match minutes advance faster than the (natural-paced) simulated play.
    if (!(dead && dead.type === "kickoff")) s.clock += h * CLOCK.matchScale;
    this.simTime += h;
    if (!dead && !s.ball.loose) s.statsFor(s.possessionTeamId).possessionSteps += 1;

    // Half-time / full-time (not mid-restart).
    if (!dead && !this.secondHalfKicked && s.clock >= this.regulation / 2) {
      s.events.push({ minute: Math.floor(this.regulation / 120), type: MatchEventType.HalfTime });
      this.secondHalfKicked = true;
      this.startKickoff(s.awayId);
      return;
    }
    if (s.clock >= this.regulation) {
      s.events.push({ minute: this.regulation / 60, type: MatchEventType.FullTime });
      this.status = "finished";
      return;
    }

    // Cadenced layers. Planning + movement run in BOTH phases (players walk to
    // their set-piece spots during a dead ball); on-ball decisions, ball physics
    // and contests only run in live play.
    this.strategyAcc += h;
    this.analysisAcc += h;
    this.decisionAcc += h;

    if (this.strategyAcc >= 1 / RATES.strategyHz) this.strategyAcc = 0;
    if (this.decisionAcc >= 1 / RATES.decisionHz) {
      this.decisionAcc = 0;
      this.planner.plan();
      if (!dead) {
        const carrier = s.carrier;
        if (carrier && carrier.controlTimer <= 0) {
          if (carrier.isGK) this.utility.distributeKeeper(carrier);
          else this.utility.decide(carrier);
        }
      }
    }
    if (this.analysisAcc >= 1 / RATES.analysisHz) {
      this.analysisAcc = 0;
      this.maps.rebuild();
      if (!s.agents[0]?.objective) this.planner.plan();
      this.movement.update();
    }

    this.physics.integrateAgents(h);

    if (dead) {
      // Ball frozen at the spot during the pause; take the restart when it ends.
      s.ball.pos = { ...dead.spot };
      s.ball.vel = { x: 0, y: 0 };
      dead.timer -= h;
      if (dead.timer <= 0) this.takeRestart();
      return;
    }

    const res = this.physics.integrateBall(h);
    if (res.goalFor) this.onGoal(res.goalFor);
    else if (res.outOfPlay) this.onOutOfPlay();
    this.contest.update(h);
  }

  // --- Match flow -----------------------------------------------------------
  private emit(type: MatchEventType, teamId?: string, extra?: Partial<MatchEvent>): void {
    this.state.events.push({ minute: Math.floor(this.state.clock / 60), type, teamId, ...extra });
  }

  private scoreGoal(teamId: string, scorer: PlayerAgent | undefined, chanceType: string): void {
    const s = this.state;
    if (teamId === s.homeId) s.score.home += 1;
    else s.score.away += 1;
    s.statsFor(teamId).goals += 1;
    this.emit(MatchEventType.Goal, teamId, {
      playerId: scorer?.id,
      playerName: scorer?.player.name,
      params: { chanceType },
    });
    this.startKickoff(s.otherTeam(teamId));
  }

  private onGoal(teamId: string): void {
    this.scoreGoal(teamId, this.state.nearestOfTeam(teamId, this.state.ball.pos), "openPlay");
  }

  /** Classify how the ball left the pitch and start the right restart. */
  private onOutOfPlay(): void {
    const s = this.state;
    if (s.ball.pendingTeamId) s.telemetry.passOut += 1;
    const exit = s.ball.pos;
    const last = s.ball.lastTouchTeamId ?? s.possessionTeamId;
    const L = FIELD.LENGTH;
    const W = FIELD.WIDTH;

    if (exit.y <= 0 || exit.y >= W) {
      // Touchline → throw-in to the opponent of the last toucher.
      const teamId = s.otherTeam(last);
      const spot = { x: clamp(exit.x, 2, L - 2), y: exit.y <= 0 ? 0 : W };
      this.emit(MatchEventType.ThrowIn, teamId);
      this.startDeadBall("throwIn", teamId, spot);
      return;
    }
    // Goal line.
    const lineX = exit.x <= 0 ? 0 : L;
    const defTeam = lineX === 0 ? s.homeId : s.awayId; // whoever defends that goal
    // A wide shot is sometimes deflected behind by a defender → corner.
    const deflected = s.ball.isShot && this.rng.chance(0.33);
    if (last === defTeam || deflected) {
      // Corner to the attacking team.
      const teamId = s.otherTeam(defTeam);
      const nearTop = exit.y < W / 2;
      const spot = { x: lineX === 0 ? 1 : L - 1, y: nearTop ? 1 : W - 1 };
      s.statsFor(teamId).corners += 1;
      this.emit(MatchEventType.Corner, teamId);
      this.startDeadBall("corner", teamId, spot, lineX);
    } else {
      // Attacker put it behind → goal kick to the defending team.
      const spot = { x: lineX === 0 ? FIELD.GOAL_AREA_DEPTH : L - FIELD.GOAL_AREA_DEPTH, y: W / 2 };
      this.emit(MatchEventType.GoalKick, defTeam);
      this.startDeadBall("goalKick", defTeam, spot, lineX);
    }
  }

  private onFoul(fouledTeamId: string, at: Vec2): void {
    const s = this.state;
    const committer = s.otherTeam(fouledTeamId);
    s.statsFor(committer).fouls += 1;
    const dir = s.dirOf(committer); // committer defends its own goal
    const inDepth = dir === 1 ? at.x <= FIELD.PENALTY_DEPTH : at.x >= FIELD.LENGTH - FIELD.PENALTY_DEPTH;
    const inWidth = at.y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && at.y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
    if (inDepth && inWidth) {
      const goalX = dir === 1 ? 0 : FIELD.LENGTH;
      const spot = { x: dir === 1 ? FIELD.PENALTY_SPOT_DIST : FIELD.LENGTH - FIELD.PENALTY_SPOT_DIST, y: FIELD.WIDTH / 2 };
      this.emit(MatchEventType.Penalty, fouledTeamId);
      this.startDeadBall("penalty", fouledTeamId, spot, goalX);
    } else {
      this.emit(MatchEventType.Foul, committer);
      const goalX = dir === 1 ? 0 : FIELD.LENGTH;
      this.startDeadBall("freeKick", fouledTeamId, { x: clamp(at.x, 2, FIELD.LENGTH - 2), y: clamp(at.y, 2, FIELD.WIDTH - 2) }, goalX);
    }
  }

  // --- Dead ball / restarts -------------------------------------------------
  private startDeadBall(type: RestartType, teamId: string, spot: Vec2, goalX?: number): void {
    const s = this.state;
    s.ball.pos = { ...spot };
    s.ball.vel = { x: 0, y: 0 };
    s.ball.ownerId = null;
    s.ball.clearFlightMeta();
    s.possessionTeamId = teamId;
    s.deadBall = { type, teamId, spot: { ...spot }, timer: DEADBALL[type], takerId: this.pickTaker(type, teamId, spot), goalX };
    // Snap everyone into position instantly only for the BIG-reposition set
    // pieces (corner, free kick, penalty) — where players would otherwise still
    // be running in when the restart is taken. A goal kick or throw-in needs no
    // big reposition, so players just walk into place during the pause.
    if (type === "corner" || type === "freeKick" || type === "penalty") {
      this.planner.plan();
      this.snapToSetPiece();
    }
  }

  /** Teleport each agent to its planned set-piece target (velocity reset). */
  private snapToSetPiece(): void {
    for (const a of this.state.agents) {
      if (a.objective) {
        a.pos = { ...a.objective.target };
        a.vel = { x: 0, y: 0 };
      }
    }
  }

  private startKickoff(teamId: string): void {
    const s = this.state;
    s.resetKickoff();
    const spot = { ...FIELD.CENTRE };
    s.ball.pos = { ...spot };
    s.ball.vel = { x: 0, y: 0 };
    s.ball.ownerId = null;
    s.ball.clearFlightMeta();
    s.possessionTeamId = teamId;
    s.deadBall = { type: "kickoff", teamId, spot, timer: DEADBALL.kickoff, takerId: this.pickTaker("kickoff", teamId, spot) };
    // Snap into the kick-off shape (both teams in their own halves, taker on the
    // spot) so nobody is caught crossing halfway during the pause.
    this.planner.plan();
    this.snapToSetPiece();
  }

  private pickTaker(type: RestartType, teamId: string, spot: Vec2): string | null {
    const s = this.state;
    const mates = s.teamAgents(teamId);
    if (type === "goalKick") return mates.find((a) => a.isGK)?.id ?? null;
    if (type === "penalty") {
      let best: PlayerAgent | undefined;
      for (const a of mates) if (!a.isGK && (!best || a.finishing > best.finishing)) best = a;
      return best?.id ?? null;
    }
    if (type === "kickoff") {
      let best: PlayerAgent | undefined;
      let bs = -Infinity;
      for (const a of mates) {
        if (a.isGK) continue;
        const sc = a.baseDepth - Math.abs(a.baseWidth - 0.5);
        if (sc > bs) { bs = sc; best = a; }
      }
      return best?.id ?? null;
    }
    // throw-in / corner / free kick: nearest outfielder to the spot.
    let best: PlayerAgent | undefined;
    let bd = Infinity;
    for (const a of mates) {
      if (a.isGK) continue;
      const d = dist(a.pos, spot);
      if (d < bd) { bd = d; best = a; }
    }
    return best?.id ?? null;
  }

  private takeRestart(): void {
    const s = this.state;
    const d = s.deadBall!;
    s.deadBall = null;
    if (d.type === "kickoff") return this.playKickoff(d);
    if (d.type === "penalty") return this.playPenalty(d);
    const taker = s.agent(d.takerId) ?? s.nearestOfTeam(d.teamId, d.spot);
    if (!taker) return;
    // A set piece is a SINGLE touch: the taker plays the ball away (pass/cross,
    // or a shot for a direct free kick) — it never carries it.
    taker.pos = { ...d.spot };
    s.possessionTeamId = d.teamId;
    this.utility.deliverRestart(taker, d.type);
  }

  private playKickoff(d: DeadBall): void {
    const s = this.state;
    const taker = s.agent(d.takerId) ?? s.teamAgents(d.teamId).find((a) => !a.isGK);
    if (!taker) return;
    taker.pos = { x: FIELD.CENTRE.x - taker.dir * 1, y: FIELD.CENTRE.y };
    s.ball.pos = { ...FIELD.CENTRE };
    // Play it to the team-mate with the MOST SPACE (and fairly central) rather
    // than the deepest man in a corner — a safe outlet that a high press can't
    // reach instantly.
    let receiver: PlayerAgent | undefined;
    let best = -Infinity;
    for (const a of s.teamAgents(d.teamId)) {
      if (a === taker || a.isGK) continue;
      const score = s.nearestOpponentDistance(a) - Math.abs(a.pos.y - FIELD.WIDTH / 2) * 0.08;
      if (score > best) { best = score; receiver = a; }
    }
    if (receiver) {
      const dd = dist(taker.pos, receiver.pos);
      const speed = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * dd), BALL.passSpeedMin, BALL.passSpeedMax);
      s.ball.launch(scale(norm(sub(receiver.pos, taker.pos)), speed), taker.id, d.teamId, { receiverId: receiver.id });
    } else {
      s.ball.ownerId = taker.id;
    }
  }

  private playPenalty(d: DeadBall): void {
    const s = this.state;
    const taker = s.agent(d.takerId);
    const defTeam = s.otherTeam(d.teamId);
    const gk = s.teamAgents(defTeam).find((a) => a.isGK);
    const finish = taker ? taker.finishing * 0.6 + taker.composure * 0.4 : 0.6;
    const refl = gk ? gk.reflexes : 0.4;
    const scoreP = clamp(0.7 + finish * 0.18 - refl * 0.14, 0.5, 0.92);
    if (this.rng.chance(scoreP)) {
      s.ball.pos = { x: d.goalX ?? attackGoalX(taker?.dir ?? 1), y: FIELD.WIDTH / 2 };
      this.scoreGoal(d.teamId, taker, "penalty");
    } else if (gk) {
      s.ball.pos = { ...gk.pos };
      s.giveBall(gk, TEMPO.firstTouch);
    }
  }
}
