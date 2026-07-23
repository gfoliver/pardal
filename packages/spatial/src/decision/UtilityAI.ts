import { MatchEventType, type RandomSource } from "@fut/engine";
import { AERIAL, AIR, BALL } from "../config.js";
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
  /** Explicit launch loft (m/s) — set for a cross so it drops into the box. */
  loft?: number;
  /** Marks a "pass" candidate as a lofted cross (telemetry + delivery). */
  cross?: boolean;
  /** Marks a "pass" candidate as a lofted through-ball into space. */
  throughBall?: boolean;
  /** Marks a "pass" candidate as a cross-field switch of play. */
  switch?: boolean;
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
    if (inBox || goalDist < 18) {
      const aggression = 0.62 + profile.directness * 0.4 + Math.max(0, profile.attackBias) * 0.5;
      // What matters is whether the shot LANE to goal is open — a defender
      // marking from BEHIND doesn't block a shot, so it shouldn't make the
      // carrier turn down a chance (the classic 1-v-1 pass-back). Shots from
      // OUTSIDE the box are discounted hard so players work a better chance
      // rather than firing speculatively from distance.
      const shootScore =
        aggression *
        curve.fall(goalDist, 4, 24) *
        sight *
        this.shotLaneOpen(carrier, goal) *
        (0.4 + carrier.finishing * 0.6) *
        (inBox ? 1 : 0.35);
      candidates.push({ kind: "shoot", score: shootScore, target: goal });
    }

    // --- CHIP (dink over an advanced keeper) ---------------------------------
    // If the keeper has come off its line, a composed/technical player can lob
    // it over them into the empty net — the natural counter to a rushing keeper.
    const oppGk = s.opponentsOf(carrier.teamId).find((o) => o.isGK);
    if (oppGk && (inBox || goalDist < 30)) {
      const gkOut = dist(oppGk.pos, goal); // how far the keeper is off its line
      // Attractive only from close range with the keeper committed off its line
      // (a rushing 1-v-1 keeper) — NOT against a keeper merely sweeping high
      // while the ball is far away.
      const chipScore =
        0.7 *
        curve.ramp(gkOut, 4, 9) *
        curve.fall(goalDist, 5, 24) *
        sight *
        this.shotLaneOpen(carrier, goal) *
        (0.25 + carrier.technique * 0.45 + carrier.composure * 0.3);
      candidates.push({ kind: "chip", score: chipScore, target: goal });
    }

    // --- PASSES --------------------------------------------------------------
    // Only the single BEST pass competes with the other action kinds — otherwise
    // "pass" wins the softmax merely by having ten candidates.
    const bestPass = this.bestPass(carrier, risk);
    if (bestPass) candidates.push(bestPass);

    // --- CROSS ---------------------------------------------------------------
    // From an advanced WIDE area with teammates attacking the box, whip in a
    // high ball for them to head — a genuinely different option from a ground
    // pass, and the main way width + crossing quality pay off.
    const cross = this.crossOption(carrier);
    if (cross) candidates.push(cross);

    // --- THROUGH BALL (lofted lob in behind) ---------------------------------
    // Slip a runner in behind the last line with a lofted ball into space — the
    // reward for a well-timed depth run against a high defensive line.
    const through = this.throughBallOption(carrier, risk);
    if (through) candidates.push(through);

    // --- SWITCH OF PLAY ------------------------------------------------------
    // Spray it cross-field to an open team-mate on the OPPOSITE flank — the way
    // to escape a packed side, use the width and vary the build-up (and it drags
    // play out to the touchlines).
    const switchPlay = this.switchOption(carrier);
    if (switchPlay) candidates.push(switchPlay);

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

    // Drop options that aren't really "on": with a small softmax temperature,
    // near-zero-score candidates would otherwise still be picked from the tail
    // (uniformly when everything scores low), leaking junk actions like a chip
    // over a keeper that never came out. Only genuinely viable options compete;
    // fall back to the full list if nothing clears the floor.
    const FLOOR = 0.1;
    const viable = candidates.filter((c) => c.score >= FLOOR);
    const pool = viable.length ? viable : candidates;
    const idx = softmaxPick(pool.map((c) => c.score), this.rng);
    const chosen = pool[idx];
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
        if (c.cross) this.state.telemetry.cross += 1;
        if (c.throughBall) this.state.telemetry.throughBall += 1;
        if (c.switch) this.state.telemetry.switchPlay += 1;
        this.pass(carrier, c.receiver, c.target!, false, c.loft);
        break;
      case "chip":
        this.chip(carrier, c.target!);
        break;
      case "clear":
        this.pass(carrier, undefined, c.target!, true, undefined, false);
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
    s.tallyShotDistance(goalDist);
    const pressure = s.nearestOpponentDistance(carrier);
    s.telemetry.shotPressureSum += pressure;
    if (pressure > 4) s.telemetry.shotUnpressured += 1;
    s.telemetry.shotLaneOpenSum += this.shotLaneOpen(carrier, goal);
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

  /** A chip/dink: a slower, high-arced shot that drops UNDER the bar behind an
   *  advanced keeper. Aimed to land ~at the goal line so it's low as it crosses
   *  (the keeper, off its line, can't get back to it). */
  private chip(carrier: PlayerAgent, goal: Vec2): void {
    const s = this.state;
    s.statsFor(carrier.teamId).shots += 1;
    s.telemetry.chip += 1;
    const d = dist(carrier.pos, goal);
    s.tallyShotDistance(d);
    const gkk = s.opponentsOf(carrier.teamId).find((o) => o.isGK);
    if (gkk) s.telemetry.chipGkOutSum += dist(gkk.pos, goal);
    const finish = carrier.technique * 0.5 + carrier.composure * 0.5;
    const onTargetP = clamp(0.32 + finish * 0.28 - d * 0.006, 0.12, 0.62);
    const onTarget = this.rng.chance(onTargetP);
    let targetY: number;
    if (onTarget) {
      s.statsFor(carrier.teamId).shotsOnTarget += 1;
      targetY = clamp(goal.y + (this.rng.next() - 0.5) * (FIELD.GOAL_WIDTH - 1), FIELD.GOAL_Y0 + 0.5, FIELD.GOAL_Y1 - 0.5);
    } else {
      const side = this.rng.next() < 0.5 ? -1 : 1;
      targetY = goal.y + side * (FIELD.GOAL_WIDTH / 2 + 0.5 + this.rng.next() * 2.5);
    }
    const aim: Vec2 = { x: goal.x, y: targetY };
    const speed = BALL.passSpeedMax * 0.62; // dinked — slower than a driven shot
    // Arch just over a pure ground-to-ground lob so it clears the keeper on the
    // way up and is dropping (low) by the time it reaches the line.
    const loft = 0.5 * AIR.gravity * (d / Math.max(speed, 4)) * 1.05;
    s.ball.launch(scale(norm(sub(aim, carrier.pos)), speed), carrier.id, carrier.teamId, { shot: true, loft });
    s.events.push({
      minute: this.minute(),
      type: MatchEventType.Shot,
      teamId: carrier.teamId,
      playerId: carrier.id,
      playerName: carrier.player.name,
      params: { onTarget, chip: true },
    });
  }

  private pass(
    carrier: PlayerAgent,
    receiver: PlayerAgent | undefined,
    lead: Vec2,
    isClear = false,
    loftOverride?: number,
    applyOffside = true,
  ): void {
    const s = this.state;
    if (!isClear) s.statsFor(carrier.teamId).passes += 1;
    // Snapshot who is offside AT THE MOMENT OF THE PASS (open play only — throw-
    // ins, goal kicks and corners are exempt). If one of them receives it, the
    // physics layer raises the flag.
    const offside = applyOffside ? s.offsidePositioned(carrier.teamId, carrier.pos.x) : [];
    // A cross rewards crossing quality; ground passing skill otherwise.
    const skill = loftOverride !== undefined ? carrier.crossing * 0.7 + carrier.technique * 0.3 : carrier.passing * 0.6 + carrier.technique * 0.4;
    const d = dist(carrier.pos, lead);
    // Amplified so skill actually matters: a weak deliverer scatters ~1.3 m at
    // 20 m (misses / gets intercepted) while an elite one is near-perfect.
    const err = (1 - skill) * (0.8 + d * 0.1) * (isClear ? 2.2 : 1);
    const target: Vec2 = {
      x: lead.x + (this.rng.next() - 0.5) * err * 2,
      y: lead.y + (this.rng.next() - 0.5) * err * 2,
    };
    const speed = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * d), BALL.passSpeedMin, BALL.passSpeedMax);
    // Loft: an explicit override (a cross) wins; else hoof a clearance high, arc
    // a long ball over the lines, or keep a short pass on the ground.
    const t = d / Math.max(speed, 4);
    const loft = loftOverride ?? (isClear ? 0.5 * AIR.gravity * t * 1.3 : d > 30 ? 0.5 * AIR.gravity * t * 0.8 : 0);
    s.ball.launch(scale(norm(sub(target, carrier.pos)), speed), carrier.id, carrier.teamId, {
      receiverId: receiver?.id,
      loft,
    });
    s.ball.offsideFlag = offside;
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
   * A cross from an advanced wide area: a high, arced delivery aimed at the
   * teammate best able to win a header in the box. Only offered when the carrier
   * is genuinely wide and high with runners to aim at — so width finally pays
   * off, and it competes with (doesn't replace) the ground pass.
   */
  private crossOption(carrier: PlayerAgent): Candidate | null {
    const dir = carrier.dir;
    const adv = dir === 1 ? carrier.pos.x : FIELD.LENGTH - carrier.pos.x;
    const wide = Math.abs(carrier.pos.y - FIELD.WIDTH / 2);
    if (adv < FIELD.LENGTH * 0.6 || wide < 14) return null; // must be advanced AND wide

    let target: PlayerAgent | null = null;
    let attackers = 0;
    for (const m of this.state.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK) continue;
      const lead = add(m.pos, scale(m.vel, 0.5));
      if (!inAttackingBox(lead, dir)) continue;
      attackers += 1;
      if (!target || m.aerial > target.aerial) target = m; // aim for the best header
    }
    if (!target) return null; // no one to cross to

    const aim = add(target.pos, scale(target.vel, 0.6));
    const profile = this.profiles[carrier.teamId]!;
    const d = dist(carrier.pos, aim);
    const score =
      (0.6 + carrier.crossing * 0.8) *
      curve.ramp(attackers, 0, 2) *
      curve.fall(d, 6, 42) *
      (0.7 + Math.max(0, profile.attackBias) * 0.6);
    const speed = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * d), BALL.passSpeedMin, BALL.passSpeedMax);
    const loft = 0.5 * AIR.gravity * (d / Math.max(speed, 4)) * AERIAL.crossArch;
    return { kind: "pass", score, receiver: target, target: aim, loft, cross: true };
  }

  /**
   * A lofted through-ball: find a team-mate breaking near/beyond the opponent's
   * last line and loft the ball into the space in behind for them to run onto.
   * Rewards fast runners and a high opposing line (space to exploit); direct /
   * attacking sides play it more often.
   */
  private throughBallOption(carrier: PlayerAgent, risk: number): Candidate | null {
    const s = this.state;
    const dir = carrier.dir;
    const oppLine = s.lastDefenderX(s.otherTeam(carrier.teamId));
    const oppGoalX = dir === 1 ? FIELD.LENGTH : 0;
    // Only worthwhile against a HIGH line with real grass in behind to run into.
    const spaceBehind = Math.abs(oppGoalX - oppLine);
    if (spaceBehind < 26) return null;
    const gk = s.opponentsOf(carrier.teamId).find((o) => o.isGK);
    let best: Candidate | null = null;
    for (const m of s.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK) continue;
      if (dir * (m.pos.x - carrier.pos.x) < 4) continue; // must be a runner ahead of the carrier
      // Runner must be ONSIDE at the moment of the pass (level or behind the
      // last line) yet poised to break — so the ball played into the space
      // beyond is legal, not an instant offside. `gap` > 0 = behind the line.
      const gap = (oppLine - m.pos.x) * dir;
      if (gap < -0.5 || gap > 6) continue;
      // Aim into the space beyond the line in the runner's lane.
      const targetX = clamp(oppLine + dir * 8, 6, FIELD.LENGTH - 6);
      const lead: Vec2 = { x: targetX, y: clamp(m.pos.y + m.vel.y * 0.4, 4, FIELD.WIDTH - 4) };
      const d = dist(carrier.pos, lead);
      if (d < 6 || d > 50) continue;
      const lane = this.maps.laneSafety(carrier.pos, lead, carrier.teamId);
      const gkGap = gk ? dist(lead, gk.pos) : 20; // open space before the keeper cleans up
      const score =
        0.4 * // base: a situational option, not a default
        (0.3 + lane * 0.5) *
        curve.fall(d, 10, 55) *
        curve.ramp(gkGap, 6, 18) *
        (0.4 + (m.player.physical.pace / 99) * 0.6) *
        risk; // only direct/attacking sides really go for it
      if (!best || score > best.score) best = { kind: "pass", score, receiver: m, target: lead };
    }
    if (!best) return null;
    const d = dist(carrier.pos, best.target!);
    const speed = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * d), BALL.passSpeedMin, BALL.passSpeedMax);
    best.loft = 0.5 * AIR.gravity * (d / Math.max(speed, 4)) * 0.9; // flatter than a cross, clips the line
    best.throughBall = true;
    return best;
  }

  /**
   * A switch of play: a long cross-field ball to an OPEN team-mate on the far
   * flank. Rewards vision + the target being wide and unmarked; a big lateral
   * distance is the point. This is what uses the width and varies the build-up.
   */
  private switchOption(carrier: PlayerAgent): Candidate | null {
    const s = this.state;
    const midY = FIELD.WIDTH / 2;
    // Only switch to RELIEVE a ball-side overload: worthwhile when clearly more
    // opponents are packed on the carrier's side than the far side.
    const carrierSide = Math.sign(carrier.pos.y - midY) || 1;
    let near = 0;
    let far = 0;
    for (const o of s.opponentsOf(carrier.teamId)) {
      if (o.isGK) continue;
      if (Math.sign(o.pos.y - midY) === carrierSide) near++;
      else far++;
    }
    if (near - far < 3) return null; // no real overload → keep building normally
    let best: Candidate | null = null;
    for (const m of s.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK) continue;
      const dy = Math.abs(m.pos.y - carrier.pos.y);
      if (dy < 22) continue; // must be a genuine cross-field switch
      if (Math.abs(m.pos.y - midY) < 12) continue; // target should be out wide
      const lead = add(m.pos, scale(m.vel, 0.3));
      const d = dist(carrier.pos, lead);
      if (d < 16 || d > 62) continue;
      let opp = Infinity;
      for (const o of s.opponentsOf(carrier.teamId)) opp = Math.min(opp, dist(o.pos, lead));
      const openness = curve.ramp(opp, 3, 14); // switch to SPACE, not into a marker
      const lane = this.maps.laneSafety(carrier.pos, lead, carrier.teamId);
      const notBackward = carrier.dir * (lead.x - carrier.pos.x) > -8; // don't switch sharply backward
      if (!notBackward) continue;
      const score =
        0.4 *
        (0.3 + lane * 0.4) *
        openness *
        curve.fall(d, 22, 64) *
        (0.4 + carrier.vision * 0.5 + carrier.passing * 0.3);
      if (!best || score > best.score) best = { kind: "pass", score, receiver: m, target: lead, switch: true };
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
    // Offside applies from a free kick, but NOT from a throw-in or corner.
    const off = type === "freeKick";
    const p = this.bestPass(taker, risk);
    if (p && p.receiver) this.pass(taker, p.receiver, p.target!, false, undefined, off);
    else this.pass(taker, undefined, this.clearTarget(taker), true, undefined, off); // no option → play it long
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
      this.pass(gk, best.m, best.lead, false, undefined, false); // keeper plays to feet — no offside
    } else {
      this.state.telemetry.clear += 1;
      this.pass(gk, undefined, this.clearTarget(gk), true, undefined, false);
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
