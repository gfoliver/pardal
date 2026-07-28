import { MatchEventType, type RandomSource } from "@fut/engine";
import { AERIAL, AIR, BALL } from "../config.js";
import { attackGoal, FIELD, inAttackingBox } from "../field.js";
import { add, clamp, dist, norm, pointToSegment, scale, sub, type Vec2 } from "../math.js";
import type { SpatialAnalysis } from "../analysis/SpatialAnalysis.js";
import type { GameState } from "../state/GameState.js";
import { SET_PIECE_RANGE } from "../planning/ObjectivePlanner.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";
import type { TacticalProfile } from "../tactics/TacticalProfile.js";
import type { ActionKind, RestartType } from "../types.js";
import { curve, softmaxPick } from "./Considerations.js";

/**
 * How far beyond the line a team-mate must be before the man on the ball notices
 * he is offside (m). Wider than the referee's 1.5 m daylight margin on purpose:
 * the gap between the two is where real offsides live.
 */
const OBVIOUS_OFFSIDE = 3.2;

interface Candidate {
  kind: ActionKind;
  score: number;
  receiver?: PlayerAgent;
  target?: Vec2;
  /**
   * How arched the delivery is (see `pass`): 1 lands on the target, higher loops
   * over it, 0/absent keeps it on the ground. A SHAPE, not a velocity — the two
   * were conflated and every cross flew a third too far.
   */
  arch?: number;
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
      const aggression = 0.9 + profile.directness * 0.4 + Math.max(0, profile.attackBias) * 0.5;
      // What matters is whether the shot LANE to goal is open — a defender
      // marking from BEHIND doesn't block a shot, so it shouldn't make the
      // carrier turn down a chance (the classic 1-v-1 pass-back). Shots from
      // OUTSIDE the box are discounted hard so players work a better chance
      // rather than firing speculatively from distance.
      //
      // This gate stops at 18 m and the box reaches 16.5, so the side takes no
      // long-range efforts AT ALL — 0.1 shots a match from beyond 20 m, where real
      // football takes about a fifth of its shots from further out. Opening it to
      // 30 m was tried and reverted: with only ~1.4 shots a match arriving inside
      // 11 m (real ≈ 4), an appetite for range does not ADD chances, it replaces
      // better ones — close-range shots fell to 1.0 and goals with them. The two
      // have to be fixed together, box arrival first.
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
        this.pass(carrier, c.receiver, c.target!, false, c.arch);
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
    const laneOpen = this.shotLaneOpen(carrier, goal);
    s.telemetry.shotPressureSum += pressure;
    if (pressure > 4) s.telemetry.shotUnpressured += 1;
    s.telemetry.shotLaneOpenSum += laneOpen;
    s.telemetry.shotsBy[carrier.line] += 1;
    // A "big chance": close in, nobody near, and a clear sight of goal. Real
    // football produces a couple of these per side per match — they are what a
    // defence exists to prevent, so their count is the honest measure of whether
    // an attack is being made to work for its openings.
    if (goalDist < 16 && pressure > 4 && laneOpen > 0.6) s.telemetry.shotBigChance += 1;
    const finish = carrier.finishing * 0.6 + carrier.composure * 0.4;
    // Accuracy: a composed finisher with a clear sight hits the target more often
    // than not from close in; scatter grows with distance and with pressure.
    //
    // Calibrated to the SHARE OF SHOTS THAT ARE ON TARGET, which real football puts
    // near 35%. At the old base of 0.42 an average finisher was at 55% from
    // fifteen metres, so half of everything hit the target and the scoreline only
    // stayed sane because the keeper then saved 79% of it. Distance and pressure
    // also weigh more heavily now: a hurried shot from twenty-five metres finding
    // the target as reliably as a free one from twelve is not a thing.
    const onTargetP = clamp(0.3 + finish * 0.28 - goalDist * 0.009 - Math.max(0, 3 - pressure) * 0.05, 0.1, 0.7);
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
    /**
     * How ARCHED the ball is: 0 keeps it on the ground, 1 is a plain ballistic
     * pass that lands on the target, above 1 loops higher and slower over the
     * same distance. It is a shape, not a velocity — see the note below.
     */
    archOverride?: number,
    applyOffside = true,
  ): void {
    const s = this.state;
    if (!isClear) {
      s.statsFor(carrier.teamId).passes += 1;
      s.telemetry.passesBy[carrier.line] += 1;
      const progress = carrier.dir * (lead.x - carrier.pos.x);
      if (progress > 3) s.telemetry.passForward += 1;
      else if (progress < -3) s.telemetry.passBack += 1;
      else s.telemetry.passSquare += 1;
      s.telemetry.passByThird[s.thirdOf(carrier.pos.x, carrier.dir)] += 1;
    }
    // Snapshot who is offside AT THE MOMENT OF THE PASS (open play only — throw-
    // ins, goal kicks and corners are exempt). If one of them receives it, the
    // physics layer raises the flag.
    const offside = applyOffside ? s.offsidePositioned(carrier.teamId, carrier.pos.x) : [];
    // A cross rewards crossing quality; ground passing skill otherwise.
    const skill = archOverride !== undefined ? carrier.crossing * 0.7 + carrier.technique * 0.3 : carrier.passing * 0.6 + carrier.technique * 0.4;
    const d = dist(carrier.pos, lead);
    // Amplified so skill actually matters: a weak deliverer scatters ~1.3 m at
    // 20 m (misses / gets intercepted) while an elite one is near-perfect.
    const err = (1 - skill) * (0.8 + d * 0.1) * (isClear ? 2.2 : 1);
    const target: Vec2 = {
      x: lead.x + (this.rng.next() - 0.5) * err * 2,
      y: lead.y + (this.rng.next() - 0.5) * err * 2,
    };
    // Speed for a ball that ROLLS the whole way: fast enough that friction leaves
    // it at `passArriveSpeed` on arrival.
    const rolling = clamp(Math.sqrt(BALL.passArriveSpeed ** 2 + 2 * BALL.friction * d), BALL.passSpeedMin, BALL.passSpeedMax);
    // Arch: a cross says its own; else hoof a clearance high, drive a long ball
    // flat over the lines, and keep a short pass on the deck.
    const arch = archOverride ?? (isClear ? 1.3 : d > 30 ? 0.8 : 0);

    /*
     * A ball in the air does not lose speed to rolling friction, so it must NOT
     * be launched at the rolling speed. Corners were measured at 0% reaching the
     * penalty box and half of them going straight out over the far touchline,
     * because the delivery budgeted for a deceleration that never happened: it
     * flew `arch`× past its target and landed still doing ~20 m/s, skidding on
     * across the pitch.
     *
     * So the arc decides the flight TIME and the horizontal speed follows from
     * it: `speed × flight === d`, always, whatever the arch. A higher arch now
     * means higher and slower over the same distance — which is what the word
     * meant all along.
     */
    const flight = arch > 0 ? (d / Math.max(rolling, 4)) * arch : 0;
    const speed = arch > 0 ? d / Math.max(flight, 0.2) : rolling;
    const loft = arch > 0 ? 0.5 * AIR.gravity * flight : 0;
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
    const ownHalf = carrier.dir * (carrier.pos.x - FIELD.LENGTH / 2) < 0;
    // A player SEES an OBVIOUSLY offside team-mate and does not pass to him. Without
    // this the side kept feeding men standing well beyond the line — nine flags a
    // match against a real two. Filtering by the referee's own 1.5 m margin instead
    // took it to nearly zero, which is just as wrong: it made the passer infallible.
    // He judges by a wider margin than the assistant does, so the marginal ones
    // still get played and still get flagged — which is what a real offside is.
    const offsideNow = new Set(s.offsidePositioned(carrier.teamId, carrier.pos.x, OBVIOUS_OFFSIDE));
    for (const mate of s.teamAgents(carrier.teamId)) {
      if (mate === carrier || offsideNow.has(mate.id)) continue;
      // The KEEPER is an outlet, not a non-person: in their own half, a side under
      // pressure plays back to him and starts again, which is a large part of why a
      // real goalkeeper touches the ball three or four times as often as ours did.
      // Only ever backwards, only in our own half — never as a way forward.
      if (mate.isGK && !(ownHalf && mate.dir * (mate.pos.x - carrier.pos.x) < 0)) continue;
      const lead = add(mate.pos, scale(mate.vel, 0.4));
      const d = dist(carrier.pos, lead);
      if (d < 4 || d > 44) continue;
      const lane = this.maps.laneSafety(carrier.pos, lead, carrier.teamId);
      const control = this.maps.controlFor(carrier.teamId, lead);
      const progress = carrier.dir * (lead.x - carrier.pos.x);
      const fwd = clamp(0.4 + progress * 0.025, 0.12, 1.15);
      const dirFactor = 1 - risk + risk * fwd * 1.6;
      const intoBox = inAttackingBox(lead, carrier.dir) && !carrierInBox ? 1.8 : 1;
      // INSIDE the opponent's box, turning back is not a real option. Watched in a
      // real match: a player in the area with a sight of goal played it backwards,
      // because the direction term still left a retreat pass at ~0.6 of a forward
      // one and that beat a shot whose lane was merely half-blocked. From in there
      // the ball goes forward, square, or at goal.
      const retreatFromBox = carrierInBox && progress < -2 ? 0.12 : 1;
      const score =
        (0.3 + lane * 0.7) *
        curve.ramp(control, -1.5, 1.5) *
        curve.fall(d, 8, 48) *
        (0.5 + carrier.passing * 0.5) *
        dirFactor *
        intoBox *
        retreatFromBox;
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
    const offsideNow = new Set(this.state.offsidePositioned(carrier.teamId, carrier.pos.x, OBVIOUS_OFFSIDE));
    for (const m of this.state.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK || offsideNow.has(m.id)) continue;
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
    return { kind: "pass", score, receiver: target, target: aim, arch: AERIAL.crossArch, cross: true };
  }

  /**
   * A ball INTO DEPTH: find a team-mate breaking near the opponent's last line and
   * play the ball into the space behind it for him to run onto — slipped along the
   * ground when it is a short one, lofted over the line when it is long. Rewards
   * fast runners and a high opposing line (space to exploit); direct / attacking
   * sides play it more often.
   */
  private throughBallOption(carrier: PlayerAgent, risk: number): Candidate | null {
    const s = this.state;
    const dir = carrier.dir;
    const oppLine = s.lastDefenderX(s.otherTeam(carrier.teamId));
    const oppGoalX = dir === 1 ? FIELD.LENGTH : 0;
    // There has to be grass behind the line to run into — but a line only needs to
    // be off its own box, not camped on halfway. At 26 m this fired against a high
    // line only, so a side that dropped even slightly could never be run in behind.
    const spaceBehind = Math.abs(oppGoalX - oppLine);
    if (spaceBehind < 18) return null;
    const gk = s.opponentsOf(carrier.teamId).find((o) => o.isGK);
    let best: Candidate | null = null;
    for (const m of s.teamAgents(carrier.teamId)) {
      if (m === carrier || m.isGK) continue;
      if (dir * (m.pos.x - carrier.pos.x) < 4) continue; // must be a runner ahead of the carrier
      // Runner must be ONSIDE at the moment of the pass (level or behind the
      // last line) yet poised to break — so the ball played into the space
      // beyond is legal, not an instant offside. `gap` > 0 = behind the line.
      // He must be ONSIDE when the ball is played (level with the line or behind it)
      // but close enough to attack the space. Six metres was too tight a window: a
      // runner starting his move from any real distance was never findable, so the
      // only depth ball in the game was to someone already standing on the line.
      const gap = (oppLine - m.pos.x) * dir;
      if (gap < -0.5 || gap > 14) continue;
      // Aim into the space beyond the line in the runner's lane.
      const targetX = clamp(oppLine + dir * 8, 6, FIELD.LENGTH - 6);
      const lead: Vec2 = { x: targetX, y: clamp(m.pos.y + m.vel.y * 0.4, 4, FIELD.WIDTH - 4) };
      const d = dist(carrier.pos, lead);
      if (d < 6 || d > 50) continue;
      const lane = this.maps.laneSafety(carrier.pos, lead, carrier.teamId);
      const gkGap = gk ? dist(lead, gk.pos) : 20; // open space before the keeper cleans up
      const score =
        0.48 * // a real option, but not the default — at 0.6 it crowded out crosses
        (0.3 + lane * 0.5) *
        curve.fall(d, 10, 55) *
        curve.ramp(gkGap, 6, 18) *
        (0.4 + (m.player.physical.pace / 99) * 0.6) *
        risk; // only direct/attacking sides really go for it
      if (!best || score > best.score) best = { kind: "pass", score, receiver: m, target: lead };
    }
    if (!best) return null;
    // Short one → SLIP IT along the ground past the line; long one → loft it over.
    // Both are balls into depth, and a game with only the lofted version is missing
    // half of how a defence gets run at.
    const d = dist(carrier.pos, best.target!);
    best.arch = d > 24 ? 0.9 : 0;
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
    // A ball-side TILT is enough. Requiring three more opponents on our side meant
    // a 7-3 split of ten outfielders, which practically never happens: measured,
    // a side switched play barely once a match, and the back line never turned it
    // to the opposite flank at all. Moving the opponent's block from side to side
    // is ordinary build-up, not an emergency exit.
    if (near - far < 1) return null;
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
        0.6 *
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
    if (type === "freeKick") {
      const d = dist(taker.pos, goal);
      const offCentre = Math.abs(taker.pos.y - FIELD.WIDTH / 2);
      // STRIKE IT, or hang it up for a header — the two ways a side takes a dead
      // ball near the box.
      //
      // The straight-line lane used to decide this, which was self-defeating: the
      // planner sets a four-man WALL on the ball→goal line nine metres out, so the
      // lane was blocked by construction and 0 of 231 threatening free kicks in a
      // measured sample were ever struck at goal. Beating a wall is what a free
      // kick IS. Distance and angle decide the attempt now, and the wall is a
      // hazard on the way rather than a veto — the ball is lofted to clear it and
      // can still be blocked by it.
      if (d < 30 && offCentre < 26 && this.rng.chance(clamp(0.85 - (d - 16) * 0.03, 0.25, 0.85))) {
        this.freeKickShot(taker, goal, d);
        return;
      }
      // Otherwise, from anywhere that threatens, put it on a head in the box.
      if (d < SET_PIECE_RANGE) {
        this.deliverCorner(taker); // same whipped delivery, aimed at the best header
        return;
      }
    }
    if (type === "goalKick") {
      this.distributeKeeper(taker); // keeper distribution (short/long)
      return;
    }
    if (type === "corner") {
      this.deliverCorner(taker); // whipped high into the box for a header
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
   * A struck free kick: lofted to clear the wall and dropping under the bar.
   *
   * `shoot` fires flat, which a wall nine metres away simply eats, so a direct
   * free kick needs its own trajectory: the horizontal speed is fixed and the
   * loft is solved so the ball is about a metre and a half up as it reaches the
   * goal line. It passes over the wall at roughly the height of a jumping
   * defender, which is why a wall still blocks some of them — as it should.
   * Accuracy comes from technique and shot power rather than finishing: this is a
   * struck ball, not a finish.
   */
  private freeKickShot(taker: PlayerAgent, goal: Vec2, d: number): void {
    const s = this.state;
    s.statsFor(taker.teamId).shots += 1;
    s.tallyShotDistance(d);
    s.telemetry.shotsBy[taker.line] += 1;
    const speed = clamp(20 + d * 0.2, 20, 27);
    const flight = d / speed;
    const loft = (1.5 + 0.5 * AIR.gravity * flight * flight) / flight; // ~1.5 m up at the line
    const quality = taker.technique * 0.5 + taker.shotPower * 0.2 + taker.composure * 0.3;
    // Real free kicks are scored from a good position perhaps one time in fifteen,
    // so most of these must miss the target — but they are struck, not scuffed.
    const onTargetP = clamp(0.16 + quality * 0.3 - Math.max(0, d - 18) * 0.012, 0.06, 0.5);
    const onTarget = this.rng.chance(onTargetP);
    let targetY: number;
    if (onTarget) {
      s.statsFor(taker.teamId).shotsOnTarget += 1;
      targetY = clamp(goal.y + (this.rng.next() - 0.5) * (FIELD.GOAL_WIDTH - 0.8), FIELD.GOAL_Y0 + 0.4, FIELD.GOAL_Y1 - 0.4);
    } else {
      const side = this.rng.next() < 0.5 ? -1 : 1;
      targetY = goal.y + side * (FIELD.GOAL_WIDTH / 2 + 0.6 + this.rng.next() * 3);
    }
    const aim: Vec2 = { x: goal.x, y: targetY };
    s.ball.launch(scale(norm(sub(aim, taker.pos)), speed), taker.id, taker.teamId, { shot: true, loft });
    s.events.push({
      minute: this.minute(),
      type: MatchEventType.Shot,
      teamId: taker.teamId,
      playerId: taker.id,
      playerName: taker.player.name,
      params: { onTarget, freeKick: true },
    });
  }

  /**
   * Corner delivery: a ball WHIPPED HIGH into the box (never a low square pass)
   * aimed at the best aerial team-mate attacking it — so corners become genuine
   * crossing/heading situations. Corners are exempt from offside.
   */
  private deliverCorner(taker: PlayerAgent): void {
    const s = this.state;
    const dir = taker.dir;
    const gx = dir === 1 ? FIELD.LENGTH : 0;
    const mid = FIELD.WIDTH / 2;
    let target: PlayerAgent | null = null;
    for (const m of s.teamAgents(taker.teamId)) {
      if (m === taker || m.isGK) continue;
      if (!inAttackingBox(m.pos, dir)) continue;
      if (!target || m.aerial > target.aerial) target = m; // pick out the best header
    }
    // Aim at the runner, else a default danger spot (near the penalty spot).
    const aim: Vec2 = target
      ? add(target.pos, scale(target.vel, 0.3))
      : { x: gx - dir * 8, y: taker.pos.y < mid ? mid - 3 : mid + 3 };
    this.state.telemetry.cross += 1;
    // Hand `pass` the ARCH and let it work out the speed and the loft together —
    // computing a loft here against a speed chosen there is what sent every
    // corner sailing over the box.
    this.pass(taker, target ?? undefined, aim, false, AERIAL.crossArch, false);
  }

  /**
   * How open the shooting lane to goal is (1 = clear, →0 = blocked). Only
   * OUTFIELD opponents BETWEEN the shooter and goal block it — a defender
   * level with or behind the shooter (or the keeper) does not, so a marked
   * striker in on goal still shoots.
   */
  private shotLaneOpen(carrier: PlayerAgent, goal: Vec2): number {
    const goalDist = dist(carrier.pos, goal);
    let blockers = 0;
    for (const o of this.state.opponentsOf(carrier.teamId)) {
      if (o.isGK) continue;
      const seg = pointToSegment(o.pos, carrier.pos, goal);
      // How far up the lane the blocker stands, in METRES. A fraction of the lane
      // was the wrong unit: at 0.05 of a thirty-metre shot it discounted every
      // defender within a metre and a half of the ball, which is exactly the body
      // a shooter has to get the ball past first.
      const along = seg.t * goalDist;
      if (along > 0.7 && seg.t < 0.9 && seg.dist < 2.0) blockers += 1;
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
