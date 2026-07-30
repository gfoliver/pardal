import { CardColor, MatchEventType, penaltyParams, SeededRandom, takePenalty, type MatchEvent, type RandomSource } from "@fut/engine";
import {
  allRoles,
  assignToSlots,
  DefaultRoleProvider,
  familiarityOf,
  type Formation,
  Position,
  type Team,
  type TeamInstructions,
  trimFormation,
} from "@fut/domain";
import { SpatialAnalysis } from "./analysis/SpatialAnalysis.js";
import { BALL, CLOCK, DEADBALL, RATES, RESTART, TEMPO } from "./config.js";
import { attackGoalX, FIELD } from "./field.js";
import { clamp, dist, norm, scale, sub, type Vec2 } from "./math.js";
import { UtilityAI } from "./decision/UtilityAI.js";
import { MovementSystem } from "./movement/MovementSystem.js";
import { Contest } from "./physics/Contest.js";
import { Physics } from "./physics/Physics.js";
import { StateHasher } from "./stateHash.js";
import { ObjectivePlanner, SET_PIECE_RANGE } from "./planning/ObjectivePlanner.js";
import { GameState } from "./state/GameState.js";
import type { PlayerAgent } from "./state/PlayerAgent.js";
import { buildProfile, type TacticalProfile } from "./tactics/TacticalProfile.js";
import type { AgentShape, DeadBall, RestartType } from "./types.js";

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
  /**
   * Physics substeps executed. The unit a divergence is reported in: `dt` only
   * decides how many substeps a `tick` runs, so the step index is the one clock two
   * runtimes can be compared on regardless of how each was driven.
   */
  private stepCount = 0;
  /** A restart waiting to be set up while the out-of-play ball finishes rolling
   *  off the pitch, and the seconds of that natural course still to play out. */
  private pendingRestart: (() => void) | null = null;
  private exitTimer = 0;
  private readonly subsUsed: Record<string, number> = {};
  /** teamId → a player hurt and awaiting the manager's replacement. */
  private readonly injured: Record<string, string | undefined> = {};
  /** Live team instructions per side (patched by in-match tactic changes). */
  private readonly instructions: Record<string, TeamInstructions>;
  private lastSubCheckMin = -1;
  private static readonly MAX_SUBS = 5;
  /** Fallback roles for slots a formation change creates. */
  private readonly roleProvider = new DefaultRoleProvider();

  /**
   * Tempo → first-touch settle time, penalised when the side isn't drilled in
   * its own tactic (familiarity < 1) — small and symmetric, not a headline
   * effect: an unfamiliar setup is slower to work the ball, not a different team.
   */
  private static firstTouchFor(profile: TacticalProfile, familiarity: number): number {
    return TEMPO.firstTouch * (1.4 - profile.tempo * 0.8) * (1 + (1 - familiarity) * 0.4);
  }
  private analysisAcc = 0;
  private decisionAcc = 0;
  private strategyAcc = 0;

  constructor(
    home: Team,
    away: Team,
    seed: number,
    regulationMinutes = 90,
    /** This side substitutes for itself — see `SpatialConfig.manualSubsTeamId`. */
    private readonly manualSubsTeamId?: string,
  ) {
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
    this.contest = new Contest(this.state, this.rng, (fouledTeam, at, committerId) => this.onFoul(fouledTeam, at, committerId));
    this.utility = new UtilityAI(this.state, this.maps, this.profiles, this.rng);
    this.regulation = regulationMinutes * 60;
    // Tempo → first-touch: a high-tempo side moves the ball quicker. A side
    // unfamiliar with its own tactic settles the ball slower on top of that.
    for (const team of [home, away]) {
      this.state.firstTouch[team.id] = MatchEngine.firstTouchFor(this.profiles[team.id]!, familiarityOf(team.tactics.instructions));
    }
    this.instructions = { [home.id]: home.tactics.instructions, [away.id]: away.tactics.instructions };
    this.subsUsed[home.id] = 0;
    this.subsUsed[away.id] = 0;
    for (const a of this.state.agents) a.stamina = a.condition; // live stamina starts at pre-match condition
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

  /** Physics substeps executed so far. See {@link stateHash}. */
  get steps(): number {
    return this.stepCount;
  }

  /**
   * A digest of everything that drives the next step, for the cross-runtime
   * conformance check. Two runtimes agreeing here after the same number of steps
   * have identical simulations; disagreeing tells you the step to look at.
   *
   * Deliberately hashes the RAW doubles of position and velocity — not rounded, or
   * it would hide the last-bit differences it exists to catch — and includes the
   * RNG's state, so a divergence in how many values have been drawn shows up
   * immediately rather than whenever it eventually reaches the scoreline.
   *
   * Iteration follows `state.agents` in array order, which is itself part of the
   * simulation's identity (see the note on lineup order in `math.ts`).
   *
   * This is NOT a serialization: `pendingRestart` is a closure, so a match cannot
   * be resumed from it. It only needs to detect difference, not restore state.
   */
  stateHash(): string {
    const s = this.state;
    const h = new StateHasher();
    h.int(this.stepCount).num(s.clock).str(this.status).bool(this.secondHalfKicked);
    h.int(s.score.home).int(s.score.away);
    for (const a of s.agents) {
      h.str(a.id)
        .str(a.teamId)
        .num(a.pos.x)
        .num(a.pos.y)
        .num(a.vel.x)
        .num(a.vel.y)
        .num(a.stamina)
        .num(a.controlTimer)
        .int(a.yellowCards)
        .maybeStr(a.objective?.kind);
    }
    const b = s.ball;
    h.num(b.pos.x)
      .num(b.pos.y)
      .num(b.vel.x)
      .num(b.vel.y)
      .num(b.z)
      .num(b.vz)
      .maybeStr(b.ownerId)
      .maybeStr(b.releaserId)
      .maybeStr(b.intendedReceiverId)
      .maybeStr(b.pendingTeamId)
      .maybeStr(b.lastTouchTeamId)
      .bool(b.isShot)
      .num(b.releaseFrom.x)
      .num(b.releaseFrom.y);
    for (const id of b.offsideFlag) h.str(id);
    h.maybeStr(s.deadBall?.type).maybeStr(s.deadBall?.teamId).num(s.deadBall?.timer ?? -1);
    // The generator last, so a draw-count divergence is unmistakable.
    h.int(this.rng instanceof SeededRandom ? this.rng.getState() : -1);
    return h.digest();
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
    this.stepCount++;
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
    if (!dead) this.maybeSubs();

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

    // The ball has left the pitch but is still visibly travelling its natural
    // course out (past the goal line / touchline). Keep rolling it — no goal /
    // reception / out checks — then set up the restart once it has finished.
    if (this.pendingRestart) {
      s.ball.roll(h);
      this.exitTimer -= h;
      const p = s.ball.pos;
      const beyond = Math.max(-p.x, p.x - FIELD.LENGTH, -p.y, p.y - FIELD.WIDTH);
      // Restart once the ball has clearly left (a set distance past the line) or
      // the grace elapses — so a rocket resets while still on-screen and a soft
      // roll still gets its full course.
      if (this.exitTimer <= 0 || beyond >= RESTART.exitMaxBeyond) {
        const restart = this.pendingRestart;
        this.pendingRestart = null;
        restart();
      }
      return;
    }

    const res = this.physics.integrateBall(h);
    if (res.goalFor) this.onGoal(res.goalFor);
    else if (res.offside) this.onOffside(res.offside);
    else if (res.outOfPlay) this.beginExit();
    this.contest.update(h);
  }

  // --- Match flow -----------------------------------------------------------
  private emit(type: MatchEventType, teamId?: string, extra?: Partial<MatchEvent>): void {
    this.state.events.push({ minute: Math.floor(this.state.clock / 60), type, teamId, ...extra });
  }

  private scoreGoal(teamId: string, scorer: PlayerAgent | undefined, chanceType: string, extra?: Record<string, string | number | boolean>): void {
    const s = this.state;
    if (teamId === s.homeId) s.score.home += 1;
    else s.score.away += 1;
    s.statsFor(teamId).goals += 1;
    this.emit(MatchEventType.Goal, teamId, {
      playerId: scorer?.id,
      playerName: scorer?.player.name,
      params: { chanceType, ...extra },
    });
    this.startKickoff(s.otherTeam(teamId));
  }

  private onGoal(teamId: string): void {
    this.scoreGoal(teamId, this.state.nearestOfTeam(teamId, this.state.ball.pos), "openPlay");
  }

  /**
   * The ball has crossed a boundary. Classify the restart NOW (from the exit
   * point, before the ball rolls on) but DEFER setting it up: the ball keeps
   * travelling its natural course out for {@link RESTART.exitRoll} seconds so
   * you can see exactly where it finished, then `pendingRestart` fires.
   */
  private beginExit(): void {
    const s = this.state;
    if (s.ball.pendingTeamId) s.telemetry.passOut += 1;
    const exit = { ...s.ball.pos };
    const last = s.ball.lastTouchTeamId ?? s.possessionTeamId;
    const L = FIELD.LENGTH;
    const W = FIELD.WIDTH;
    this.exitTimer = RESTART.exitRoll;

    if (exit.y <= 0 || exit.y >= W) {
      // Touchline → throw-in to the opponent of the last toucher.
      const teamId = s.otherTeam(last);
      const spot = { x: clamp(exit.x, 2, L - 2), y: exit.y <= 0 ? 0 : W };
      this.pendingRestart = () => {
        s.telemetry.throwIn += 1;
        this.emit(MatchEventType.ThrowIn, teamId);
        this.startDeadBall("throwIn", teamId, spot);
      };
      return;
    }
    // Goal line.
    const lineX = exit.x <= 0 ? 0 : L;
    const defTeam = lineX === 0 ? s.homeId : s.awayId; // whoever defends that goal
    // A wide/blocked shot is often deflected behind by a defender → corner.
    const deflected = s.ball.isShot && this.rng.chance(0.5);
    if (last === defTeam || deflected) {
      // Corner to the attacking team.
      const teamId = s.otherTeam(defTeam);
      const nearTop = exit.y < W / 2;
      const spot = { x: lineX === 0 ? 1 : L - 1, y: nearTop ? 1 : W - 1 };
      this.pendingRestart = () => {
        s.statsFor(teamId).corners += 1;
        this.emit(MatchEventType.Corner, teamId);
        this.startDeadBall("corner", teamId, spot, lineX);
      };
    } else {
      // Attacker put it behind → goal kick to the defending team.
      const spot = { x: lineX === 0 ? FIELD.GOAL_AREA_DEPTH : L - FIELD.GOAL_AREA_DEPTH, y: W / 2 };
      this.pendingRestart = () => {
        this.emit(MatchEventType.GoalKick, defTeam);
        this.startDeadBall("goalKick", defTeam, spot, lineX);
      };
    }
  }

  /** An attacker was flagged offside → indirect free kick to the defenders. */
  private onOffside(o: { defendingTeam: string; at: Vec2 }): void {
    const s = this.state;
    const offsideTeam = s.otherTeam(o.defendingTeam);
    s.statsFor(offsideTeam).offsides += 1;
    s.telemetry.offside += 1;
    this.emit(MatchEventType.Offside, offsideTeam);
    const dir = s.dirOf(o.defendingTeam); // the defending side now plays the free kick out
    // `goalX` means the goal the TAKER threatens — that is the convention `onFoul`
    // uses, and it is what decides whether a wall goes up and whether everyone is
    // snapped into a set-piece shape. This passed the taker's OWN goal, which an
    // offside flag is always close to, so every single flag teleported twenty-two
    // players into a wall-and-box formation that had nothing to do with the
    // situation. The side restarting from an offside attacks the FAR goal, so
    // nothing snaps and they simply walk back into shape.
    const goalX = dir === 1 ? FIELD.LENGTH : 0;
    const spot = { x: clamp(o.at.x, 2, FIELD.LENGTH - 2), y: clamp(o.at.y, 2, FIELD.WIDTH - 2) };
    this.startDeadBall("freeKick", o.defendingTeam, spot, goalX);
  }

  private onFoul(fouledTeamId: string, at: Vec2, committerId: string): void {
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
    this.maybeCard(committerId, committer);
    this.maybeInjury(fouledTeamId, at);
  }

  /**
   * A hard foul can injure the fouled player.
   *
   * For a side the engine manages, the replacement happens immediately — or the
   * team goes down to ten if the bench is spent. For the WATCHED side it does
   * neither: it records who is hurt and stops there, so the UI can halt the
   * match and put the decision in front of the manager. Auto-subbing his injured
   * player would be the game picking his replacement for him, which is the one
   * thing he came to the match screen to do.
   */
  private maybeInjury(teamId: string, at: Vec2): void {
    if (!this.rng.chance(0.02)) return;
    const victim = this.state.nearestOfTeam(teamId, at);
    if (!victim) return;
    this.emit(MatchEventType.Injury, teamId, { playerId: victim.id, playerName: victim.player.name });

    if (teamId === this.manualSubsTeamId) {
      // He stays on until the manager acts. The UI pauses on the event, so no
      // meaningful match time passes with a hobbling player on the pitch.
      this.injured[teamId] = victim.id;
      return;
    }
    if (!this.trySub(teamId, victim.id, true)) this.state.removeAgent(victim.id); // no subs left → down to 10
  }

  /** The manually-managed side's player awaiting a replacement, if any. */
  pendingInjury(teamId: string): string | undefined {
    return this.injured[teamId];
  }

  /**
   * Give up on replacing an injured player and play on a man down — the choice
   * a manager makes when his bench is empty or he'd rather keep the sub.
   */
  playOnWithoutInjured(teamId: string): boolean {
    const id = this.injured[teamId];
    if (!id) return false;
    this.state.removeAgent(id);
    delete this.injured[teamId];
    this.reshapeForNumbers(teamId);
    return true;
  }

  // --- in-match management (user control) ---------------------------------
  /** Substitutions still available to a team. */
  subsRemaining(teamId: string): number {
    return MatchEngine.MAX_SUBS - (this.subsUsed[teamId] ?? 0);
  }
  /** Players currently on the pitch for a team (id/name/position/stamina). */
  onPitch(teamId: string): { id: string; name: string; position: string; stamina: number }[] {
    return this.state.teamAgents(teamId).map((a) => ({ id: a.id, name: a.player.name, position: a.player.position, stamina: a.stamina }));
  }
  /** Bench players a team can still bring on. */
  /**
   * Bench players, WITH their rating and condition.
   *
   * The engine holds the actual athlete, so it is the only honest source for these
   * while a match is running: the in-match board used to look each substitute up in
   * the career's tactics view instead, which lists the matchday eighteen and not the
   * rest of the squad — so anyone outside it was "not found" and got shown as
   * overall 0, a rating no footballer has.
   */
  bench(teamId: string): { id: string; name: string; position: string; overall: number }[] {
    return this.state.benchPlayers(teamId).map((p) => ({ id: p.id, name: p.name, position: p.position, overall: Math.round(p.overall()) }));
  }
  /** User-requested substitution of a specific bench player for an on-pitch one. */
  requestSub(teamId: string, outId: string, inId: string): boolean {
    return this.trySub(teamId, outId, false, inId);
  }
  /** Change a team's instructions mid-match (rebuilds its tactical profile). */
  setInstructions(teamId: string, patch: Partial<TeamInstructions>): void {
    if (!this.instructions[teamId]) return;
    const next = { ...this.instructions[teamId]!, ...patch };
    this.instructions[teamId] = next;
    this.profiles[teamId] = buildProfile(next);
    this.state.firstTouch[teamId] = MatchEngine.firstTouchFor(this.profiles[teamId]!, familiarityOf(next));
    this.emit(MatchEventType.TacticChange, teamId, { params: { mentality: next.mentality } });
  }
  /** A team's live instructions (what the in-match tactics screen edits). */
  instructionsOf(teamId: string): TeamInstructions | undefined {
    return this.instructions[teamId];
  }

  /**
   * The side's shape as it stands: who is on the pitch, the cell each occupies,
   * the job they've been given and how much is left in their legs. This is what
   * the in-match tactics screen draws — the live equivalent of a stored lineup.
   */
  shape(teamId: string): AgentShape[] {
    return this.state.teamAgents(teamId).map((a) => ({
      id: a.id,
      name: a.player.name,
      /** Natural position — what the player actually is. */
      position: a.player.position,
      /** Slot position — the job they're doing in this shape. */
      fielded: a.fielded,
      depth: a.baseDepth,
      width: a.baseWidth,
      roleKey: a.roleKey,
      overall: Math.round(a.player.overall()),
      stamina: a.stamina,
      isGoalkeeper: a.isGK,
      booked: a.yellowCards,
    }));
  }

  /**
   * Switch a team's formation mid-match, re-fitting the eleven ALREADY on the
   * pitch to the new template (exact positions first, keeper stays in goal).
   * Roles follow the new slot unless the player already suits it, so a defender
   * pushed into midfield gets a midfielder's job rather than keeping a defensive
   * one. Nobody moves instantly — the block reshapes as they walk into the cells.
   */
  setFormation(teamId: string, formation: Formation): boolean {
    if (!this.refit(teamId, formation)) return false;
    this.setInstructions(teamId, { formation });
    return true;
  }

  /**
   * Re-fit whoever is on the pitch to a formation, without announcing a tactic
   * change. The shape is trimmed to the number of bodies available first, so a
   * side down to ten is asked for a ten-man shape rather than an eleven-man one
   * with a hole in it (see `trimFormation`).
   */
  private refit(teamId: string, formation: Formation): boolean {
    const agents = this.state.teamAgents(teamId);
    if (agents.length === 0) return false;
    const template = trimFormation(formation, agents.length);
    const assignment = assignToSlots(
      agents.map((a) => ({
        id: a.id,
        position: a.player.position,
        isGoalkeeper: a.isGK,
        rating: a.player.overall(),
        ratingAt: (position: Position) => a.player.overall(position),
      })),
      template,
    );
    for (const [i, slot] of assignment.slots.entries()) {
      const cell = template[i];
      if (!slot || !cell) continue;
      // A player whose job is unchanged KEEPS the role the manager gave him —
      // only someone moved to a different position needs a new one, since a
      // poacher makes no sense at centre-back. Otherwise every reshape (and every
      // red card, which now triggers one) would quietly reset the whole side's
      // roles to their defaults.
      const stays = this.state.agent(slot.playerId)?.fielded === cell.position;
      const role = stays ? undefined : this.roleProvider.defaultRoleFor(cell.position);
      this.state.reshapeAgent(slot.playerId, {
        depth: cell.depth,
        width: cell.width,
        role: role?.movement,
        roleKey: role?.key,
        fielded: cell.position,
      });
    }
    return true;
  }

  /**
   * Reorganise a side that has just lost a man — the reshuffle a manager makes
   * from the touchline the moment he is down to ten. Without it the ten keep the
   * eleven-man shape they were given, one slot simply unoccupied, and the gap
   * sits precisely where the man was lost.
   */
  private reshapeForNumbers(teamId: string): void {
    const formation = this.instructions[teamId]?.formation;
    if (formation) this.refit(teamId, formation);
  }

  /** Drag a player to another cell (normalised depth/width), keeping their role. */
  movePlayer(playerId: string, depth: number, width: number): boolean {
    return this.state.reshapeAgent(playerId, { depth: clamp(depth, 0, 1), width: clamp(width, 0, 1) });
  }

  /** Two team-mates swap places in the shape (no substitution involved). */
  swapPlayers(aId: string, bId: string): boolean {
    return this.state.swapCells(aId, bId);
  }

  /**
   * Field a player in a different position, keeping their cell. Their role
   * follows the new position (a poacher makes no sense at centre-back), and only
   * a keeper can be asked to keep goal.
   */
  setFieldedPosition(playerId: string, position: Position): boolean {
    const agent = this.state.agent(playerId);
    if (!agent) return false;
    if ((position === Position.Goalkeeper) !== agent.isGK) return false;
    const role = this.roleProvider.defaultRoleFor(position);
    return this.state.reshapeAgent(playerId, { fielded: position, role: role.movement, roleKey: role.key });
  }

  /** Give a player a different tactical role, keeping their cell. */
  setRole(playerId: string, roleKey: string): boolean {
    // A role coming from outside the engine may not exist — an unknown one is
    // refused, never thrown, so a bad UI value can't abandon the match.
    const role = allRoles().find((r) => r.key === roleKey);
    if (!role) return false;
    return this.state.reshapeAgent(playerId, { role: role.movement, roleKey: role.key });
  }

  /** Bring a bench player on for `outId` if a sub slot remains. */
  private trySub(teamId: string, outId: string, injury: boolean, inId?: string): boolean {
    if ((this.subsUsed[teamId] ?? 0) >= MatchEngine.MAX_SUBS) return false;
    const res = this.state.substitute(outId, inId);
    if (!res) return false;
    this.subsUsed[teamId] = (this.subsUsed[teamId] ?? 0) + 1;
    // Taking the hurt player off clears the flag that was holding the match up.
    if (this.injured[teamId] === outId) delete this.injured[teamId];
    this.emit(MatchEventType.Substitution, teamId, {
      playerId: res.on.id,
      playerName: res.on.player.name,
      secondaryPlayerId: res.off.id,
      secondaryPlayerName: res.off.player.name,
      params: { injury },
    });
    return true;
  }

  /**
   * Fatigue-driven subs: once per match-minute, each side replaces its most
   * exhausted outfielder if one is badly gassed and a slot remains.
   *
   * Skips the manually-managed side entirely. Not even an injury is decided for
   * him: `maybeInjury` flags the hurt player and the UI halts on it, so the
   * bench is his and only his.
   */
  private maybeSubs(): void {
    const min = this.minute;
    if (min === this.lastSubCheckMin || min < 55) return; // subs come in the closing third
    this.lastSubCheckMin = min;
    for (const teamId of [this.state.homeId, this.state.awayId]) {
      if (teamId === this.manualSubsTeamId) continue;
      if ((this.subsUsed[teamId] ?? 0) >= MatchEngine.MAX_SUBS) continue;
      let worst: PlayerAgent | undefined;
      for (const a of this.state.teamAgents(teamId)) {
        if (a.isGK) continue;
        if (!worst || a.stamina < worst.stamina) worst = a;
      }
      if (worst && worst.stamina < 0.66) this.trySub(teamId, worst.id, false);
    }
  }

  /** Book or send off the fouling player (aggression-weighted; 2nd yellow or a
   *  straight red removes them). */
  private maybeCard(committerId: string, teamId: string): void {
    const s = this.state;
    const p = s.agent(committerId);
    if (!p) return;
    const aggr = p.player.mental.aggression / 99;
    if (this.rng.chance(0.003 + aggr * 0.005)) {
      this.sendOff(p, teamId, CardColor.Red); // straight red
      return;
    }
    if (this.rng.chance(0.115 + aggr * 0.145)) {
      p.yellowCards += 1;
      s.statsFor(teamId).yellowCards += 1;
      this.emit(MatchEventType.Card, teamId, { playerId: p.id, playerName: p.player.name, params: { color: CardColor.Yellow } });
      if (p.yellowCards >= 2) this.sendOff(p, teamId, CardColor.Red);
    }
  }

  /**
   * Send a named player off. The referee reaches dismissal through `maybeCard`;
   * this is the same act from outside — a scripted red for the diagnostic
   * harnesses and the tests, which must exercise the REAL path (card, then the
   * side reorganises) rather than deleting a body from the state behind the
   * engine's back.
   */
  sendOffPlayer(playerId: string): boolean {
    const p = this.state.agent(playerId);
    if (!p) return false;
    this.sendOff(p, p.teamId, CardColor.Red);
    return true;
  }

  private sendOff(p: PlayerAgent, teamId: string, color: CardColor): void {
    this.state.statsFor(teamId).redCards += 1;
    this.emit(MatchEventType.Card, teamId, { playerId: p.id, playerName: p.player.name, params: { color, sentOff: true } });
    this.state.removeAgent(p.id);
    this.reshapeForNumbers(teamId);
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
    if (this.needsSnap(type, spot, goalX)) {
      this.planner.plan();
      this.snapToSetPiece();
    }
  }

  /**
   * Does this restart need everyone teleported into place?
   *
   * Only when the shape genuinely changes: a corner or a penalty rearranges both
   * sides completely, and a free kick near the box does too. A free kick from
   * deep does NOT — and snapping it looked exactly as wrong as it was. An offside
   * is given as a free kick to the DEFENDING side, almost always deep in their own
   * half, so every flag teleported twenty-two players into a wall-and-box
   * formation that had nothing to do with the situation. Left alone they simply
   * walk back into shape during the pause, which is what a team actually does.
   */
  private needsSnap(type: RestartType, spot: Vec2, goalX?: number): boolean {
    if (type === "corner" || type === "penalty") return true;
    if (type !== "freeKick") return false;
    const gx = goalX ?? 0;
    return dist(spot, { x: gx, y: FIELD.WIDTH / 2 }) < SET_PIECE_RANGE;
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
      const speed = clamp(Math.sqrt(BALL.passArriveSpeed * BALL.passArriveSpeed + 2 * BALL.friction * dd), BALL.passSpeedMin, BALL.passSpeedMax);
      s.ball.launch(scale(norm(sub(receiver.pos, taker.pos)), speed), taker.id, d.teamId, { receiverId: receiver.id });
    } else {
      s.ball.ownerId = taker.id;
    }
  }

  /**
   * Take the spot kick, and RECORD it: where it finished and which way the
   * keeper went, so the moment can be drawn afterwards rather than just
   * summarised. A penalty also counts as a shot — it never used to, so a game
   * decided from the spot showed the winner one shot short.
   */
  private playPenalty(d: DeadBall): void {
    const s = this.state;
    const taker = s.agent(d.takerId);
    const defTeam = s.otherTeam(d.teamId);
    const gk = s.teamAgents(defTeam).find((a) => a.isGK);
    const finish = taker ? taker.finishing * 0.6 + taker.composure * 0.4 : 0.6;
    const refl = gk ? gk.reflexes : 0.4;
    const scoreP = clamp(0.7 + finish * 0.18 - refl * 0.14, 0.5, 0.92);
    const kick = takePenalty(this.rng, scoreP);
    const onTarget = kick.outcome === "goal" || kick.outcome === "saved";
    const stats = s.statsFor(d.teamId);
    stats.shots += 1;
    if (onTarget) stats.shotsOnTarget += 1;

    if (kick.outcome === "goal") {
      s.ball.pos = { x: d.goalX ?? attackGoalX(taker?.dir ?? 1), y: FIELD.WIDTH / 2 };
      this.scoreGoal(d.teamId, taker, "penalty", penaltyParams(kick));
      return;
    }
    // A missed penalty used to leave no trace in the timeline at all.
    this.emit(MatchEventType.Shot, d.teamId, {
      playerId: taker?.id,
      playerName: taker?.player.name,
      params: { ...penaltyParams(kick), onTarget, saved: kick.outcome === "saved", woodwork: kick.outcome === "post" },
    });
    // Either way the keeper restarts with it: he has claimed the save, or it's a
    // goal kick — from here those are the same thing.
    if (gk) {
      s.ball.pos = { ...gk.pos };
      s.giveBall(gk, TEMPO.firstTouch);
    }
  }
}
