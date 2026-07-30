import { AIR, DEADBALL } from "../config.js";
import { attackGoalX, FIELD, type SideDir } from "../field.js";
import { add, clamp, dist, len, norm, scale, sub, type Vec2 } from "../math.js";
import type { SpatialAnalysis } from "../analysis/SpatialAnalysis.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerAgent } from "../state/PlayerAgent.js";
import { Formation } from "../tactics/Formation.js";
import type { TacticalProfile } from "../tactics/TacticalProfile.js";
import type { Objective } from "../types.js";

/**
 * Camada 3 — Objective planning. Every decision tick (~10 Hz) this assigns one
 * coarse objective to each player based on the phase of play, their role and
 * the spatial maps. The MovementSystem then turns objectives into steering
 * targets. Objectives are intentions ("support the carrier", "hold the line"),
 * never scripted waypoints — the actual coordinates come from SBSP + spatial
 * analysis so behaviour stays emergent.
 */
/**
 * How close a free kick must be to the goal it threatens before it is treated as
 * a set-piece opportunity — wall, and attackers into the box. Shared with
 * `MatchEngine.needsSnap`, which decides whether to teleport everyone into that
 * shape: the two have to agree, or players snap into a formation the planner
 * never asked for.
 */
export const SET_PIECE_RANGE = 34;

/** How far a player will travel to fill a support job in the attacking structure. */
const SUPPORT_REACH = 30;

/** How far BEHIND the offside line an attacker holds his position (m). */
const ONSIDE_MARGIN = 1.3;

/** How far off his line a keeper will come to claim a dropping ball (m). */
const CLAIM_DEPTH = 11;
/** Seconds of head start a keeper is granted for having hands, when judging a claim. */
const CLAIM_ADVANTAGE = 0.35;

/**
 * Final tiebreak for the sorts below, by codepoint (never `localeCompare`, whose
 * collation depends on the runtime's locale data).
 *
 * A comparator that only differences floats is not a total order: exact ties — two
 * mirror-symmetric defenders right after a set-piece snap, say — fall through to the
 * source array's order, and that order is `teams[teamId]`, which MUTATES as players
 * are sent off and substituted. So who presses and who covers could depend on the
 * sending-off history. Deterministic either way, but only if every client saw the
 * same history in the same order; this removes the coupling entirely.
 */
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);

export class ObjectivePlanner {
  constructor(
    private readonly state: GameState,
    private readonly maps: SpatialAnalysis,
    private readonly profiles: Record<string, TacticalProfile>,
  ) {}

  plan(): void {
    const s = this.state;
    if (s.deadBall) {
      this.planSetPiece();
      return;
    }
    if (s.ball.loose) {
      this.planLoose();
    } else {
      const attackTeam = s.possessionTeamId;
      this.planAttack(attackTeam);
      this.planDefend(s.otherTeam(attackTeam));
    }
    // Keepers always get a keeper objective regardless of phase.
    for (const a of s.agents) if (a.isGK) a.objective = this.keeperObjective(a);
  }

  // --- Dead-ball / set-piece positioning ------------------------------------
  private planSetPiece(): void {
    const s = this.state;
    const d = s.deadBall!;
    const atk = d.teamId;
    const def = s.otherTeam(atk);
    const taker = s.agent(d.takerId);

    // Kick-off: everyone stays in their OWN HALF (formation kick-off spots), the
    // defending side outside the centre circle, and only the taker at the spot.
    // No one may cross halfway until the ball is played.
    if (d.type === "kickoff") {
      const cx = FIELD.CENTRE.x;
      for (const a of s.agents) {
        if (a.id === d.takerId) {
          a.objective = { kind: "holdShape", target: { x: cx - a.dir * 1.5, y: FIELD.CENTRE.y } };
          continue;
        }
        if (a.isGK) {
          a.objective = this.keeperObjective(a);
          continue;
        }
        // Own half, and (for the defending side) outside the centre circle.
        const home = { ...a.kickoffHome };
        home.x = a.dir === 1 ? Math.min(home.x, cx - 1) : Math.max(home.x, cx + 1);
        if (a.teamId === def) {
          const dc = dist(home, FIELD.CENTRE);
          if (dc < FIELD.CENTRE_RADIUS + 1) {
            const away = norm({ x: home.x - cx, y: home.y - FIELD.CENTRE.y });
            home.x = cx + away.x * (FIELD.CENTRE_RADIUS + 1.5);
            home.y = FIELD.CENTRE.y + away.y * (FIELD.CENTRE_RADIUS + 1.5);
          }
        }
        a.objective = { kind: "holdShape", target: home };
      }
      return;
    }

    // Everyone defaults to a calm hold at their SBSP home relative to the spot.
    for (const a of s.agents) {
      if (a.isGK) {
        a.objective = this.keeperObjective(a);
        continue;
      }
      a.objective = { kind: "holdShape", target: this.home(a, this.profiles[a.teamId]!, a.teamId === atk) };
    }

    const outAtk = s.teamAgents(atk).filter((a) => !a.isGK && a !== taker);
    const outDef = s.teamAgents(def).filter((a) => !a.isGK);
    const gx = d.goalX ?? 0;

    if (d.type === "corner") {
      // Attackers crowd the box (bar one holder at halfway); defenders pack it.
      this.fillBox(outAtk.slice(0, Math.max(1, outAtk.length - 1)), gx, 7, 6.5);
      const holder = outAtk[outAtk.length - 1];
      if (holder) holder.objective = { kind: "holdShape", target: { x: FIELD.LENGTH / 2, y: FIELD.WIDTH / 2 } };
      this.fillBox(outDef.slice(0, Math.max(1, outDef.length - 1)), gx, 5, 5);
      const spare = outDef[outDef.length - 1];
      if (spare) spare.objective = { kind: "holdShape", target: { x: FIELD.LENGTH / 2, y: FIELD.WIDTH / 2 } };
    } else if (d.type === "freeKick" && dist(d.spot, { x: gx, y: FIELD.WIDTH / 2 }) < SET_PIECE_RANGE) {
      // Defensive wall between the ball and the defended goal — but only for a
      // kick that actually threatens it. Four men used to line up in a wall for a
      // free kick eighty metres out, which is where a good part of the "teams
      // teleport into a strange shape" after an offside came from: the flag gives
      // the ball to the DEFENDING side, deep, and they walled up against their own
      // goal for no reason.
      const toGoal = norm({ x: gx - d.spot.x, y: FIELD.WIDTH / 2 - d.spot.y });
      const wallC = { x: d.spot.x + toGoal.x * DEADBALL.wall, y: d.spot.y + toGoal.y * DEADBALL.wall };
      const perp = { x: -toGoal.y, y: toGoal.x };
      const wallCount = Math.min(4, outDef.length);
      const byNear = [...outDef].sort((a, b) => dist(a.pos, wallC) - dist(b.pos, wallC) || byId(a, b));
      for (let i = 0; i < wallCount; i++) {
        const off = (i - (wallCount - 1) / 2) * 1.2;
        byNear[i]!.objective = { kind: "holdShape", target: { x: wallC.x + perp.x * off, y: wallC.y + perp.y * off } };
      }
      // Attackers push into the box for an advanced free kick.
      this.fillBox(outAtk, gx, 8, 6);
    } else if (d.type === "penalty") {
      // All outfielders wait outside the box (around the arc); only taker + GK inside.
      const dir = gx === 0 ? 1 : -1;
      const lineX = gx + dir * (FIELD.PENALTY_DEPTH + 4);
      const others = [...outAtk, ...outDef];
      others.forEach((a, i) => {
        const y = clamp(FIELD.WIDTH / 2 + (i - (others.length - 1) / 2) * 3.4, 6, FIELD.WIDTH - 6);
        a.objective = { kind: "holdShape", target: { x: lineX, y } };
      });
    } else if (d.type === "goalKick") {
      // Only the OPPONENTS must clear the penalty area before it's taken; the
      // kicking side can stay in its own box.
      for (const a of outDef) if (a.objective) a.objective.target = this.clearBox(a.objective.target, gx);
    }

    if (taker) taker.objective = { kind: "holdShape", target: { ...d.spot } };
  }

  /** Push a target out of the penalty area at `goalX` (used for goal kicks). */
  private clearBox(p: Vec2, goalX: number): Vec2 {
    const inWidth = p.y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && p.y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
    const edge = goalX === 0 ? FIELD.PENALTY_DEPTH + 1.5 : FIELD.LENGTH - FIELD.PENALTY_DEPTH - 1.5;
    const inside = goalX === 0 ? p.x < edge : p.x > edge;
    return inWidth && inside ? { x: edge, y: p.y } : p;
  }

  /** Scatter players inside the penalty area near `goalX` (rows × columns). */
  private fillBox(players: PlayerAgent[], goalX: number, inset: number, stepY: number): void {
    const into = goalX === 0 ? 1 : -1;
    const rows = 2;
    players.forEach((a, i) => {
      const row = i % rows;
      const col = Math.floor(i / rows);
      const cols = Math.ceil(players.length / rows);
      const depth = inset + row * 5.5;
      const y = clamp(FIELD.WIDTH / 2 + (col - (cols - 1) / 2) * stepY, FIELD.GOAL_Y0 - 5, FIELD.GOAL_Y1 + 5);
      a.objective = { kind: "holdShape", target: { x: goalX + into * depth, y } };
    });
  }

  /**
   * Outfielders this side has MINUS the opponent's — 0 at eleven a side, +1 for
   * the side a man up, −1 for the side a man down.
   *
   * Everything a sending-off means goes through this one number. A side with a
   * spare man commits him: an extra body in the support structure in possession,
   * and an extra body to the ball out of it (he has nobody to mark and no space
   * to protect that a mate isn't already covering, so the free man goes hunting).
   * A side a man down cannot afford that commitment and keeps the body in its
   * block instead. At even numbers every term below is exactly what it was, so
   * nothing about an 11-v-11 match changes.
   *
   * Before this, the attack organised itself around a FIXED three supporters and
   * the spare defender held shape, so the eleventh man contributed nothing and
   * losing him cost almost nothing — a sending-off was close to free.
   */
  private numericalEdge(teamId: string): number {
    const s = this.state;
    const count = (as: PlayerAgent[]) => as.reduce((n, a) => n + (a.isGK ? 0 : 1), 0);
    return count(s.teamAgents(teamId)) - count(s.opponentsOf(teamId));
  }

  // --- In possession --------------------------------------------------------
  private planAttack(teamId: string): void {
    const s = this.state;
    const profile = this.profiles[teamId]!;
    const carrier = s.carrier;
    const mates = s.teamAgents(teamId).filter((a) => !a.isGK && a !== carrier);

    // Distinct support anchors around the carrier (forward-left, forward-right,
    // wide-left, wide-right, and one safe drop behind). The nearest team-mates
    // are each assigned a DIFFERENT anchor so they spread into passing lanes and
    // forward space instead of all converging on the ball.
    const anchors = carrier ? this.supportAnchors(carrier) : [];
    const supporterTarget = new Map<string, Vec2>();
    const edge = this.numericalEdge(teamId);
    if (carrier) {
      // How many men take a job in the structure. In BUILD-UP that is most of the
      // side — the whole point of building is that everyone offers themselves, and
      // the anchors themselves cap it. In the final third it stays a handful,
      // because the box only holds so many bodies and the rest must not abandon
      // the shape. The numerical edge moves it either way (see numericalEdge).
      const supporters = clamp((this.finalThird(carrier) ? 3 : 5) + edge, 2, anchors.length);
      // Each ANCHOR goes to the nearest available mate — the structure defines the
      // jobs and whoever is closest to one takes it. Handing the nearest mates an
      // anchor each (what this used to do) meant the men BEHIND the ball never got
      // a job at all: the five closest to the carrier are always midfielders and
      // forwards, which is how a back four ends up watching its own attack while
      // the ball recycles through the same two central midfielders.
      for (const anchor of anchors.slice(0, supporters)) {
        let pick: PlayerAgent | undefined;
        let bd = Infinity;
        for (const a of mates) {
          if (supporterTarget.has(a.id)) continue;
          const d = dist(a.pos, anchor);
          if (d < bd) { bd = d; pick = a; }
        }
        // Nobody sprints half the pitch to fill a slot he is nowhere near.
        if (!pick || bd > SUPPORT_REACH) continue;
        // Refine to the most open cell within a few metres of the anchor.
        supporterTarget.set(pick.id, this.maps.bestSupportCell(teamId, anchor, pick.dir, 0, 7));
      }
    }

    for (const a of mates) {
      if (a.id === carrier?.id) continue;
      const support = supporterTarget.get(a.id);
      // Attack-minded / direct sides send more runners in behind; cautious sides
      // keep more players in shape. The tactic dictates how many push forward —
      // and so does the count on the pitch: a side a man down keeps that body in
      // the block instead of running it in behind.
      const runThreshold = 0.6 - profile.attackBias * 0.25 - profile.directness * 0.15 - edge * 0.15;
      if (support) {
        a.objective = { kind: "support", target: support };
      } else if ((a.line === "fwd" || a.line === "mid") && a.role.runFrequency > runThreshold) {
        a.objective = { kind: "attackDepth", target: this.depthRun(a) };
      } else if (a.role.widthBias > 0.35) {
        a.objective = { kind: "provideWidth", target: this.wideHome(a, profile) };
      } else {
        a.objective = { kind: "holdShape", target: this.home(a, profile, true) };
      }
      // Keep every attacker onside — no one camps beyond the last defender.
      a.objective.target = this.onside(a, a.objective.target);
    }
    // While settling the ball the carrier CARRIES it forward into space (rather
    // than freezing), until the utility AI picks a concrete action.
    if (carrier) {
      const goal = { x: carrier.dir === 1 ? FIELD.LENGTH : 0, y: FIELD.WIDTH / 2 };
      const fwd = { x: carrier.pos.x + (goal.x - carrier.pos.x) * 0.12, y: carrier.pos.y + (goal.y - carrier.pos.y) * 0.05 };
      carrier.objective = { kind: "onBall", target: this.onside(carrier, fwd) };
    }
  }

  // --- Out of possession ----------------------------------------------------
  private planDefend(teamId: string): void {
    const s = this.state;
    const profile = this.profiles[teamId]!;
    const carrier = s.carrier;
    const defs = s.teamAgents(teamId).filter((a) => !a.isGK);
    if (!carrier) return;

    const byDist = [...defs].sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos) || byId(a, b));
    const presser = byDist[0];
    const coverer = byDist[1];
    const assigned = new Set<string>();

    if (presser) {
      presser.objective = { kind: "press", target: this.pressPoint(presser, carrier, 0.25) };
      assigned.add(presser.id);
    }
    if (coverer) {
      // A high-pressing side sends the second man to hunt the ball too; a
      // low-block side keeps him as cover, protecting the space behind.
      if (profile.pressing > 0.7) coverer.objective = { kind: "press", target: this.pressPoint(coverer, carrier, 0.2) };
      else coverer.objective = { kind: "cover", target: this.coverPoint(coverer, carrier) };
      assigned.add(coverer.id);
    }

    // A SPARE MAN goes to the ball. With more bodies than the opponent has
    // attackers there is a defender with nobody to pick up, and holding shape
    // with him is the waste that made a sending-off nearly free for the ten: the
    // free man joins the hunt, which is what winning the ball back quicker — and
    // higher — actually looks like when you are a man up.
    for (const extra of byDist.slice(2, 2 + Math.max(0, this.numericalEdge(teamId)))) {
      extra.objective = { kind: "press", target: this.pressPoint(extra, carrier, 0.2) };
      assigned.add(extra.id);
    }

    // Remaining defenders pick up dangerous attackers (those advanced into the
    // defensive third / box), ball-side. Pressing intensity dictates how far up
    // the pitch and how many men they track; a low block only tightens near its
    // own goal. Everyone else holds the compact SBSP block.
    const marks = this.assignMarks(teamId, assigned, profile.manMarking, profile.pressing);
    for (const a of defs) {
      if (assigned.has(a.id)) continue;
      const targetId = marks.get(a.id);
      if (targetId) {
        const att = s.agent(targetId)!;
        a.objective = { kind: "markMan", target: this.shadeOf(a, att.pos, 1.8), refId: targetId };
      } else {
        a.objective = { kind: "holdShape", target: this.home(a, profile, false) };
      }
    }
  }

  // --- Loose ball -----------------------------------------------------------
  private planLoose(): void {
    const s = this.state;
    const ballLead: Vec2 = {
      x: s.ball.pos.x + s.ball.vel.x * 0.3,
      y: s.ball.pos.y + s.ball.vel.y * 0.3,
    };
    const chasers = new Set<string>();
    for (const teamId of [s.homeId, s.awayId]) {
      const near = s.nearestOfTeam(teamId, s.ball.pos);
      if (near) chasers.add(near.id);
    }
    const receiver = s.agent(s.ball.intendedReceiverId);
    if (receiver) chasers.add(receiver.id);

    for (const a of s.agents) {
      if (a.isGK) continue;
      if (chasers.has(a.id)) {
        a.objective = { kind: "chaseLoose", target: ballLead };
      } else {
        const attacking = a.teamId === s.possessionTeamId;
        a.objective = { kind: "holdShape", target: this.home(a, this.profiles[a.teamId]!, attacking) };
      }
    }
  }

  // --- Target helpers -------------------------------------------------------
  private home(a: PlayerAgent, profile: TacticalProfile, attacking: boolean): Vec2 {
    return Formation.homePosition(a, this.state.ball.pos, profile, attacking);
  }

  /**
   * Candidate support positions spread around the carrier: two forward options
   * (the primary way to progress), two wide-and-level options to stretch the
   * pitch, and one safe drop behind. Supporters claim distinct anchors so they
   * fan out into passing lanes rather than huddling on the ball.
   */
  /**
   * Is this a final-third attack rather than build-up? Shared by the anchor set
   * and by the count of men committed to it, so the two can never disagree about
   * which phase of an attack the side is in.
   */
  private finalThird(carrier: PlayerAgent): boolean {
    return Math.abs(attackGoalX(carrier.dir) - carrier.pos.x) < 30;
  }

  private supportAnchors(carrier: PlayerAgent): Vec2[] {
    const f = carrier.dir;
    const cx = carrier.pos.x;
    const cy = carrier.pos.y;
    const cl = (y: number) => clamp(y, 5, FIELD.WIDTH - 5);
    const gx = attackGoalX(f);
    const midY = FIELD.WIDTH / 2;

    // Final third: supporters ATTACK THE BOX (posts, penalty spot, a late
    // far-side runner) so a wide/deep carrier has central options to cross or
    // cut back to — instead of everyone bunching in the corner to recycle.
    if (this.finalThird(carrier)) {
      return [
        { x: gx - f * 8, y: cl(midY - 9) }, // near post
        { x: gx - f * 8, y: cl(midY + 9) }, // far post
        { x: gx - f * 16, y: cl(midY) }, // penalty spot / cut-back
        { x: gx - f * 22, y: cl(cy < midY ? midY + 18 : midY - 18) }, // late runner, opposite side
        { x: cx - f * 11, y: cy }, // recycle option behind
      ];
    }
    // Build-up: a structure AROUND the ball, not just ahead of it. Two forward
    // options to progress, two square ones to circulate, and two genuinely behind
    // the ball to recycle through.
    //
    // Four of the five old anchors pointed forward, which is why the ball ratcheted
    // up the pitch through the forwards and the back line barely touched it (a
    // defender took a third of a forward's touches, where real football is the
    // other way round by two or three times). A side with nowhere to go backwards
    // has to force the pass forward; one with outlets behind the ball can be made
    // to work for the opening instead.
    return [
      { x: cx + f * 22, y: cl(cy - 18) }, // forward, inside-left
      { x: cx + f * 22, y: cl(cy + 18) }, // forward, inside-right
      { x: cx + f * 2, y: cl(cy - 26) }, // square, wide left
      { x: cx + f * 2, y: cl(cy + 26) }, // square, wide right
      { x: cx - f * 14, y: cl(cy - 11) }, // behind, recycle left
      { x: cx - f * 14, y: cl(cy + 11) }, // behind, recycle right
    ];
  }

  private wideHome(a: PlayerAgent, profile: TacticalProfile): Vec2 {
    const h = this.home(a, profile, true);
    // Push toward whichever touchline the player's mirrored home is already
    // nearer — using raw baseWidth here would send the away side to the wrong
    // flank (a dir-mirror bug), degrading away's shape.
    const touch = h.y < FIELD.WIDTH / 2 ? 6 : FIELD.WIDTH - 6;
    return { x: h.x, y: clamp(h.y * 0.5 + touch * 0.5, 3, FIELD.WIDTH - 3) };
  }

  private depthRun(a: PlayerAgent): Vec2 {
    const offside = this.state.lastDefenderX(this.state.otherTeam(a.teamId));
    const target: Vec2 = { x: offside - a.dir * ONSIDE_MARGIN * 1.6, y: a.pos.y };
    return this.onside(a, target);
  }

  /**
   * Clip a target so an attacker never sits beyond the offside line — and keep him
   * a metre or so BEHIND it rather than exactly on it.
   *
   * Standing on the line means every step the defence takes upfield catches him:
   * measured, that produced nine offsides a side per match against a real two. A
   * forward times his run from just behind the line, which is both how it is done
   * and what stops the flag going up constantly.
   */
  private onside(a: PlayerAgent, target: Vec2): Vec2 {
    const offside = this.state.lastDefenderX(this.state.otherTeam(a.teamId));
    const hold = offside - a.dir * ONSIDE_MARGIN;
    const x = a.dir === 1 ? Math.min(target.x, hold) : Math.max(target.x, hold);
    return { x: clamp(x, 2, FIELD.LENGTH - 2), y: clamp(target.y, 2, FIELD.WIDTH - 2) };
  }

  private lead(a: PlayerAgent, t: number): Vec2 {
    return { x: a.pos.x + a.vel.x * t, y: a.pos.y + a.vel.y * t };
  }

  /** The centre of the goal a player defends. */
  private ownGoal(dir: SideDir): Vec2 {
    return { x: dir === 1 ? 0 : FIELD.LENGTH, y: FIELD.WIDTH / 2 };
  }

  /**
   * Where to close the carrier down: not ON him, but on the GOAL SIDE of him.
   *
   * A defender who arrives from whichever side he happened to be standing blocks
   * nothing — he contests the ball and leaves the shot untouched, which is most of
   * why shots were being taken down essentially open lanes (measured lane openness
   * 0.97 of 1). Closing from the goal side puts a body in the shooting lane as a
   * consequence of arriving at all, which is what a defender is FOR, and it still
   * leaves him inside tackling distance.
   */
  private pressPoint(defender: PlayerAgent, carrier: PlayerAgent, t: number): Vec2 {
    const lead = this.lead(carrier, t);
    const toGoal = norm(sub(this.ownGoal(defender.dir), lead));
    return add(lead, scale(toGoal, 1.2));
  }

  /**
   * Where to stand to mark a man: on the bisector of "between him and the ball"
   * and "between him and our goal" — his ball-side shoulder, goal-side of him.
   * Standing merely goal-side (what this used to do) leaves both the pass into him
   * and his sight of goal completely untouched.
   */
  private shadeOf(defender: PlayerAgent, att: Vec2, gap: number): Vec2 {
    const toGoal = norm(sub(this.ownGoal(defender.dir), att));
    const toBall = norm(sub(this.state.ball.pos, att));
    const sum = add(toBall, toGoal);
    // Degenerate only when the man stands exactly between ball and goal — then
    // goal-side is the side that matters.
    const shade = len(sum) < 0.2 ? toGoal : norm(sum);
    const p = add(att, scale(shade, gap));
    return { x: this.floorDepth(defender.dir, p.x), y: clamp(p.y, 2, FIELD.WIDTH - 2) };
  }

  private coverPoint(coverer: PlayerAgent, carrier: PlayerAgent): Vec2 {
    // Drop ~8 m goal-side of the carrier, pulled toward the pitch centre.
    return {
      x: this.floorDepth(coverer.dir, carrier.pos.x - coverer.dir * 8),
      y: carrier.pos.y * 0.6 + (FIELD.WIDTH / 2) * 0.4,
    };
  }

  /**
   * Prevent defenders collapsing onto their own goal line: no marking/cover
   * target may sit closer than MIN_DEF_ADVANCE metres from the own goal (the
   * keeper's domain). Without this, marking a deep attacker drags the whole
   * line into the six-yard box in a runaway collapse.
   */
  private floorDepth(dir: SideDir, x: number): number {
    const MIN = 9; // m from own goal
    const adv = dir === 1 ? x : FIELD.LENGTH - x;
    const capped = Math.max(adv, MIN);
    return clamp(dir === 1 ? capped : FIELD.LENGTH - capped, 2, FIELD.LENGTH - 2);
  }

  private assignMarks(teamId: string, assigned: Set<string>, man: boolean, press: number): Map<string, string> {
    const s = this.state;
    const dir = s.dirOf(teamId);
    const ownGoalX = dir === 1 ? 0 : FIELD.LENGTH;
    // Pick up any opponent who is a threat to RECEIVE — which, at a minimum, is
    // everyone who has come into our half — and send the nearest defender who can
    // get there. Marking used to be gated on the attacker being within ~48 m of our
    // own goal and capped at a handful of men, so an opponent forward standing in
    // the middle third was nobody's problem: measured, fewer than two of our ten
    // were marking anybody at any moment, and their forwards were free to receive
    // the ball 38 times a match where a real striker gets about 30 in ninety
    // minutes. Two men always stay out of it, holding the block — a side that
    // man-marks with everybody has no shape left behind the marking.
    const dangerRange = (man ? 62 : 54) + press * 18; // m from our goal within which we track
    const reach = (man ? 17 : 14) + press * 10; // m a defender will travel to pick a man up
    const attackers = s
      .opponentsOf(teamId)
      .filter((a) => !a.isGK && a.id !== s.ball.ownerId && Math.abs(a.pos.x - ownGoalX) < dangerRange)
      .sort((a, b) => Math.abs(a.pos.x - ownGoalX) - Math.abs(b.pos.x - ownGoalX) || byId(a, b));
    const defenders = s.teamAgents(teamId).filter((d) => !d.isGK && !assigned.has(d.id));
    const maxMarks = clamp(defenders.length - 2, 1, 7);
    const used = new Set<string>();
    const marks = new Map<string, string>();
    for (const att of attackers) {
      if (marks.size >= maxMarks) break;
      let pick: PlayerAgent | undefined;
      let bd = Infinity;
      for (const d of defenders) {
        if (used.has(d.id)) continue;
        const dd = dist(d.pos, att.pos);
        if (dd < bd) {
          bd = dd;
          pick = d;
        }
      }
      if (!pick || bd > reach) continue;
      used.add(pick.id);
      marks.set(pick.id, att.id);
    }
    return marks;
  }

  /**
   * Goalkeeper positioning: on the ball→goal-centre bisector, at a depth that
   * is ALWAYS behind the last defender (clamped) up to a small sweeper
   * allowance. Fixes keepers drifting ahead of their defence.
   */
  private keeperObjective(gk: PlayerAgent): Objective {
    const s = this.state;
    const dir = gk.dir;
    const goalX = dir === 1 ? 0 : FIELD.LENGTH;
    const goalCentre = { x: goalX, y: FIELD.WIDTH / 2 };
    const ball = s.ball.pos;
    const advance = (x: number): number => (dir === 1 ? x : FIELD.LENGTH - x);
    const lastDefAdvance = advance(s.lastDefenderX(gk.teamId));

    // CLAIM A HIGH BALL: a loose lofted ball (cross/lob) dropping into the box →
    // charge off the line to catch it at its landing spot, commanding the area.
    //
    // Only when he is genuinely FAVOURITE for it, though. Coming for everything
    // that dropped anywhere in the eighteen-yard box meant the keeper claimed 90
    // of 94 corners — real keepers take something like one in six — and those 94
    // corners produced one shot between them. A keeper commands the area he can
    // actually reach first: within `CLAIM_DEPTH` of his line, arriving by the time
    // the ball does, and ahead of the nearest attacker. Otherwise he holds his
    // ground and lets the defenders head it, which is what makes a set piece a
    // contest at all.
    const b = s.ball;
    if (b.airborne && b.loose && !b.isShot) {
      const g = AIR.gravity;
      const t = (b.vz + Math.sqrt(b.vz * b.vz + 2 * g * Math.max(b.z, 0))) / g; // time to land
      const land = { x: b.pos.x + b.vel.x * t, y: b.pos.y + b.vel.y * t };
      const landAdv = advance(land.x);
      const inBoxWidth = land.y >= (FIELD.WIDTH - FIELD.PENALTY_WIDTH) / 2 && land.y <= (FIELD.WIDTH + FIELD.PENALTY_WIDTH) / 2;
      if (landAdv > 0.5 && landAdv < CLAIM_DEPTH && inBoxWidth) {
        // Hands beat heads, so he needs only to be close to first, not clearly.
        const keeperArrival = dist(gk.pos, land) / Math.max(gk.maxSpeed, 1) - CLAIM_ADVANTAGE;
        let attackerArrival = Infinity;
        for (const o of s.opponentsOf(gk.teamId)) {
          if (o.isGK) continue;
          attackerArrival = Math.min(attackerArrival, dist(o.pos, land) / Math.max(o.maxSpeed, 1));
        }
        if (keeperArrival < attackerArrival && keeperArrival <= t) {
          const claimAdv = clamp(landAdv, 0.6, CLAIM_DEPTH); // won't sprint past the penalty spot
          const cx = dir === 1 ? claimAdv : FIELD.LENGTH - claimAdv;
          return { kind: "keeper", target: { x: cx, y: clamp(land.y, FIELD.GOAL_Y0 - 6, FIELD.GOAL_Y1 + 6) } };
        }
      }
    }

    // COME OFF THE LINE in a 1-v-1: if an opponent is bearing down on goal with
    // the ball, through/level with the last defender, the keeper charges out
    // along the goal→ball line to close the angle (stopping short of the ball).
    const carrier = s.carrier;
    if (carrier && carrier.teamId !== gk.teamId) {
      const carrierDist = dist(carrier.pos, goalCentre);
      const through = advance(carrier.pos.x) <= lastDefAdvance + 1.5;
      const central = Math.abs(carrier.pos.y - FIELD.WIDTH / 2) < 22;
      // Genuine close 1-v-1 only. Come out to shade the angle (about half-way to
      // the attacker, capped) — enough to narrow it, not so far as to be chipped
      // or leave an open net.
      if (carrierDist < 17 && through && central) {
        const out = norm(sub(carrier.pos, goalCentre));
        const outDist = clamp(carrierDist * 0.5, 2, 8);
        return { kind: "keeper", target: add(goalCentre, scale(out, outDist)) };
      }
    }

    // Otherwise: on the ball→goal bisector, sweeping further out when the ball
    // is far (space behind a high line) but ALWAYS behind the last defender.
    const y = clamp(FIELD.WIDTH / 2 + (ball.y - FIELD.WIDTH / 2) * 0.7, FIELD.GOAL_Y0 - 1.5, FIELD.GOAL_Y1 + 1.5);
    const sweep = clamp(advance(ball.x) * 0.16, 1.5, 16);
    const keeperAdvance = clamp(Math.min(sweep, lastDefAdvance - 2), 0.6, 18);
    const x = dir === 1 ? keeperAdvance : FIELD.LENGTH - keeperAdvance;
    return { kind: "keeper", target: { x, y } };
  }
}
