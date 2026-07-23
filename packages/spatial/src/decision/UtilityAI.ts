import { MatchEventType, type RandomSource } from "@fut/engine";
import { BALL } from "../config.js";
import { attackGoal, FIELD, inAttackingBox } from "../field.js";
import { add, clamp, dist, norm, pointToSegment, scale, sub, type Vec2 } from "../math.js";
import type { SpatialAnalysis } from "../analysis/SpatialAnalysis.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";
import type { TacticalProfile } from "../tactics/TacticalProfile.js";
import type { ActionKind, RestartType } from "../types.js";
import { curve, softmaxPick } from "./Considerations.js";

interface Candidate {
  kind: ActionKind;
  score: number;
  receiver?: PlayerAgent;
  target?: Vec2;
}

/**
 * Camada 4 — Utility AI. Scores every on-ball option with response curves and
 * picks via softmax (near-deterministic, not rigid). The role's decision
 * weights and the tactical profile bias the scores; RNG only breaks ties and
 * adds execution error, never the core choice. Returns whether the ball was
 * released (so the carrier stops dribbling).
 */
export class UtilityAI {
  constructor(
    private readonly state: GameState,
    private readonly maps: SpatialAnalysis,
    private readonly profiles: Record<string, TacticalProfile>,
    private readonly rng: RandomSource,
  ) {}

  decide(carrier: PlayerAgent): void {
    const s = this.state;
    const profile = this.profiles[carrier.teamId]!;
    const goal = attackGoal(carrier.dir);
    const goalDist = dist(carrier.pos, goal);
    const pressure = s.nearestOpponentDistance(carrier); // m of space
    const inBox = inAttackingBox(carrier.pos, carrier.dir);

    const candidates: Candidate[] = [];

    // Risk appetite comes from the TACTICS: an attacking / direct side weights
    // forward progression and shooting; a cautious / possession side values safe
    // retention. This single knob makes the tactic visibly change how a team
    // plays. ~0.2 (very cautious) … ~1.0 (gung-ho).
    const risk = clamp(0.5 + profile.attackBias * 0.3 + profile.directness * 0.3, 0.2, 1.0);

    // --- SHOOT ---------------------------------------------------------------
    // A clear sight of goal from a shooting position SHOULD beat a safe pass —
    // strikers don't turn down clear chances. Aggression scales with the tactic.
    const sightAngle = Math.abs(carrier.pos.y - FIELD.WIDTH / 2);
    const sight = curve.fall(sightAngle, 8, 20 + goalDist * 0.3);
    if (inBox || goalDist < 20) {
      const aggression = 0.9 + profile.directness * 0.4 + Math.max(0, profile.attackBias) * 0.5;
      // What matters is whether the shot LANE to goal is open — a defender
      // marking from BEHIND doesn't block a shot, so it shouldn't make the
      // carrier turn down a chance (the classic 1-v-1 pass-back).
      const shootScore =
        aggression *
        curve.fall(goalDist, 4, 26) *
        sight *
        this.shotLaneOpen(carrier, goal) *
        (0.4 + carrier.finishing * 0.6) *
        (inBox ? 1 : 0.55);
      candidates.push({ kind: "shoot", score: shootScore, target: goal });
    }

    // --- PASSES --------------------------------------------------------------
    // Only the single BEST pass competes with the other action kinds — otherwise
    // "pass" wins the softmax merely by having ten candidates.
    const bestPass = this.bestPass(carrier, risk);
    if (bestPass) candidates.push(bestPass);

    // --- DRIBBLE / DRIVE -----------------------------------------------------
    // A clear run at goal is a BIG opportunity — a player (especially a quick
    // one or a forward) with open field ahead should drive at it, not pass back.
    const supporters = this.supportersNear(carrier);
    const notAlone = inBox ? curve.ramp(supporters, 0, 2) : 1; // don't dribble into the box alone
    const runway = this.driveRunway(carrier); // 0 (blocked) … 1 (open field to goal)
    const pace = carrier.player.physical.pace / 99;
    const drive = carrier.line === "fwd" ? 1 : carrier.line === "mid" ? 0.8 : 0.55;
    // Multiplicative on the runway: NO dribble when the path is blocked (pass is
    // the default), attractive only with real space ahead — the more open, the
    // quicker the player, the more of an attacker, the stronger the pull.
    const dribbleScore = runway * (0.35 + carrier.dribbling * 0.5) * (0.5 + pace * 0.5) * drive * notAlone;
    candidates.push({ kind: "dribble", score: dribbleScore, target: this.dribbleTarget(carrier) });

    // --- HOLD ----------------------------------------------------------------
    // Last resort only — players should move the ball, not sit on it.
    candidates.push({ kind: "hold", score: 0.05 + carrier.composure * 0.05, target: { ...carrier.pos } });

    // --- CLEAR (deep, under heavy pressure) ----------------------------------
    const ownGoalDist = dist(carrier.pos, { x: carrier.dir === 1 ? 0 : FIELD.LENGTH, y: FIELD.WIDTH / 2 });
    if (ownGoalDist < 30 && pressure < 2) {
      candidates.push({ kind: "clear", score: 0.4 * curve.fall(pressure, 0.5, 3), target: this.clearTarget(carrier) });
    }

    const idx = softmaxPick(candidates.map((c) => c.score), this.rng);
    const chosen = candidates[idx];
    if (!chosen) return;
    this.state.telemetry.decisions += 1;
    this.state.telemetry[chosen.kind] += 1;
    this.execute(carrier, chosen);
  }

  private execute(carrier: PlayerAgent, c: Candidate): void {
    switch (c.kind) {
      case "shoot":
        this.shoot(carrier, c.target!);
        break;
      case "pass":
        this.pass(carrier, c.receiver!, c.target!);
        break;
      case "clear":
        this.pass(carrier, undefined, c.target!, true);
        break;
      case "dribble":
        carrier.objective = { kind: "onBall", target: c.target! };
        break;
      case "hold":
        carrier.objective = { kind: "onBall", target: c.target! };
        break;
    }
  }

  // --- Action execution -----------------------------------------------------
  private shoot(carrier: PlayerAgent, goal: Vec2): void {
    const s = this.state;
    s.statsFor(carrier.teamId).shots += 1;
    const goalDist = dist(carrier.pos, goal);
    const pressure = s.nearestOpponentDistance(carrier);
    const finish = carrier.finishing * 0.6 + carrier.composure * 0.4;
    const onTargetP = clamp(0.34 + finish * 0.22 - goalDist * 0.006 - Math.max(0, 3 - pressure) * 0.03, 0.12, 0.66);
    const onTarget = this.rng.chance(onTargetP);
    let targetY: number;
    if (onTarget) {
      s.statsFor(carrier.teamId).shotsOnTarget += 1;
      targetY = clamp(goal.y + (this.rng.next() - 0.5) * (FIELD.GOAL_WIDTH - 0.6), FIELD.GOAL_Y0 + 0.3, FIELD.GOAL_Y1 - 0.3);
    } else {
      const side = this.rng.next() < 0.5 ? -1 : 1;
      targetY = goal.y + side * (FIELD.GOAL_WIDTH / 2 + 0.8 + this.rng.next() * 3.5);
    }
    const aim: Vec2 = { x: goal.x, y: targetY };
    const speed = BALL.shotSpeed + carrier.shotPower * BALL.shotSpeedVar;
    s.ball.launch(scale(norm(sub(aim, carrier.pos)), speed), carrier.id, carrier.teamId, { shot: true });
    s.events.push({
      minute: this.minute(),
      type: MatchEventType.Shot,
      teamId: carrier.teamId,
      playerId: carrier.id,
      playerName: carrier.player.name,
      params: { onTarget },
    });
  }

  private pass(carrier: PlayerAgent, receiver: PlayerAgent | undefined, lead: Vec2, isClear = false): void {
    const s = this.state;
    if (!isClear) s.statsFor(carrier.teamId).passes += 1;
    const skill = carrier.passing * 0.6 + carrier.technique * 0.4;
    const d = dist(carrier.pos, lead);
    // Amplified so passing skill actually matters: a weak passer scatters ~1.3 m
    // at 20 m (misses / gets intercepted) while an elite one is near-perfect.
    const err = (1 - skill) * (0.8 + d * 0.1) * (isClear ? 2.2 : 1);
    const target: Vec2 = {
      x: lead.x + (this.rng.next() - 0.5) * err * 2,
      y: lead.y + (this.rng.next() - 0.5) * err * 2,
    };
    const speed = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * d), BALL.passSpeedMin, BALL.passSpeedMax);
    s.ball.launch(scale(norm(sub(target, carrier.pos)), speed), carrier.id, carrier.teamId, {
      receiverId: receiver?.id,
    });
  }

  /** Best forward-biased pass for a carrier (into-box crosses/cut-backs bonused). */
  private bestPass(carrier: PlayerAgent, risk: number): Candidate | null {
    const s = this.state;
    const carrierInBox = inAttackingBox(carrier.pos, carrier.dir);
    let best: Candidate | null = null;
    for (const mate of s.teamAgents(carrier.teamId)) {
      if (mate === carrier || mate.isGK) continue;
      const lead = add(mate.pos, scale(mate.vel, 0.4));
      const d = dist(carrier.pos, lead);
      if (d < 4 || d > 44) continue;
      const lane = this.maps.laneSafety(carrier.pos, lead, carrier.teamId);
      const control = this.maps.controlFor(carrier.teamId, lead);
      const progress = carrier.dir * (lead.x - carrier.pos.x);
      const fwd = clamp(0.4 + progress * 0.025, 0.12, 1.15);
      const dirFactor = 1 - risk + risk * fwd * 1.6;
      const intoBox = inAttackingBox(lead, carrier.dir) && !carrierInBox ? 1.8 : 1;
      const score =
        (0.3 + lane * 0.7) *
        curve.ramp(control, -1.5, 1.5) *
        curve.fall(d, 8, 48) *
        (0.5 + carrier.passing * 0.5) *
        dirFactor *
        intoBox;
      if (!best || score > best.score) best = { kind: "pass", score, receiver: mate, target: lead };
    }
    return best;
  }

  /**
   * Take a set-piece restart in a SINGLE touch — the taker plays the ball AWAY
   * (a shot for a free kick in range, else a pass/cross) and never gains
   * carriable possession, so it can't dribble the restart. It is the releaser,
   * so it can't immediately re-touch its own delivery either.
   */
  deliverRestart(taker: PlayerAgent, type: RestartType): void {
    const s = this.state;
    s.ball.pos = { ...taker.pos };
    s.ball.ownerId = null;
    const goal = attackGoal(taker.dir);
    if (type === "freeKick" && dist(taker.pos, goal) < 27 && this.shotLaneOpen(taker, goal) > 0.35) {
      this.shoot(taker, goal); // direct free kick
      return;
    }
    if (type === "goalKick") {
      this.distributeKeeper(taker); // keeper distribution (short/long)
      return;
    }
    const profile = this.profiles[taker.teamId]!;
    const risk = clamp(0.5 + profile.attackBias * 0.3 + profile.directness * 0.3, 0.2, 1.0);
    const p = this.bestPass(taker, risk);
    if (p && p.receiver) this.pass(taker, p.receiver, p.target!);
    else this.pass(taker, undefined, this.clearTarget(taker), true); // no option → play it long
  }

  /**
   * How open the shooting lane to goal is (1 = clear, →0 = blocked). Only
   * OUTFIELD opponents BETWEEN the shooter and goal block it — a defender
   * level with or behind the shooter (or the keeper) does not, so a marked
   * striker in on goal still shoots.
   */
  private shotLaneOpen(carrier: PlayerAgent, goal: Vec2): number {
    let blockers = 0;
    for (const o of this.state.opponentsOf(carrier.teamId)) {
      if (o.isGK) continue;
      const seg = pointToSegment(o.pos, carrier.pos, goal);
      if (seg.t > 0.05 && seg.t < 0.9 && seg.dist < 2.0) blockers += 1;
    }
    return curve.fall(blockers, 0, 2.5); // 0→1, 1→0.6, ≥2.5→0
  }

  /**
   * How clear the field is straight ahead toward goal (1 = open field to run
   * into, 0 = an opponent right in front). Measures the nearest OUTFIELD
   * opponent inside a forward corridor — this is what makes a counter with
   * "the whole pitch to run into" an attractive drive rather than a pass back.
   */
  private driveRunway(carrier: PlayerAgent): number {
    const dir = carrier.dir;
    let nearestAhead = Infinity;
    for (const o of this.state.opponentsOf(carrier.teamId)) {
      if (o.isGK) continue;
      const forward = (o.pos.x - carrier.pos.x) * dir; // + = ahead toward goal
      const lateral = Math.abs(o.pos.y - carrier.pos.y);
      // A defender within this wedge (widening with distance) blocks the run.
      if (forward > 0 && forward < 30 && lateral < 6 + forward * 0.25) nearestAhead = Math.min(nearestAhead, forward);
    }
    return curve.ramp(nearestAhead, 5, 24); // opp within 5 m → 0, clear for 24 m → 1
  }

  /**
   * Goalkeeper distribution. A keeper never dribbles or shoots — it plays the
   * ball out to the best open outfielder (safe lane, prefers a forward option),
   * or clears long if pressed / no option. Without this the keeper hoards the
   * ball for the whole match.
   */
  distributeKeeper(gk: PlayerAgent): void {
    const s = this.state;
    let best: { m: PlayerAgent; lead: Vec2 } | null = null;
    let bestScore = -Infinity;
    for (const m of s.teamAgents(gk.teamId)) {
      if (m === gk) continue;
      const lead = { ...m.pos }; // play to feet
      const d = dist(gk.pos, lead);
      if (d < 6 || d > 55) continue;
      const lane = this.maps.laneSafety(gk.pos, lead, gk.teamId);
      const forward = gk.dir * (lead.x - gk.pos.x);
      const score = (0.3 + lane * 0.7) * (0.5 + curve.logistic(forward, 0, 0.06) * 0.5) * curve.fall(d, 10, 62);
      if (score > bestScore) {
        bestScore = score;
        best = { m, lead };
      }
    }
    this.state.telemetry.decisions += 1;
    if (best && bestScore > 0.25) {
      this.state.telemetry.pass += 1;
      this.pass(gk, best.m, best.lead);
    } else {
      this.state.telemetry.clear += 1;
      this.pass(gk, undefined, this.clearTarget(gk), true);
    }
  }

  // --- Scoring helpers ------------------------------------------------------
  private supportersNear(carrier: PlayerAgent): number {
    let n = 0;
    for (const m of this.state.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK) continue;
      if (dist(m.pos, carrier.pos) < 16) n++;
    }
    return n;
  }

  private dribbleTarget(carrier: PlayerAgent): Vec2 {
    const goal = attackGoal(carrier.dir);
    // Head generally goalward but toward the more open channel.
    const towardGoal = norm(sub(goal, carrier.pos));
    const step = add(carrier.pos, scale(towardGoal, 10));
    return {
      x: clamp(step.x, 3, FIELD.LENGTH - 3),
      y: clamp(step.y + (this.rng.next() - 0.5) * 6, 4, FIELD.WIDTH - 4),
    };
  }

  private clearTarget(carrier: PlayerAgent): Vec2 {
    return {
      x: clamp(carrier.pos.x + carrier.dir * 35, 3, FIELD.LENGTH - 3),
      y: this.rng.next() < 0.5 ? 10 : FIELD.WIDTH - 10,
    };
  }

  private minute(): number {
    return Math.floor(this.state.clock / 60);
  }
}
