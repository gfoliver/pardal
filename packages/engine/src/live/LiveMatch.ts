import { type Position } from "@fut/domain";
import { createResolverRegistry } from "../actions/resolvers.js";
import { kickoff } from "../actions/effects.js";
import { norm } from "../actions/probability.js";
import { MatchClock, type TimeSegment } from "../clock/MatchClock.js";
import { AiCoachController } from "../coach/AiCoachController.js";
import { type CoachController } from "../coach/CoachController.js";
import { DecisionEngine } from "../decision/DecisionEngine.js";
import { PositioningModel } from "../positioning/PositioningModel.js";
import { SeededRandom } from "../random/SeededRandom.js";
import { RefereeAdjudicator } from "../referee/RefereeAdjudicator.js";
import { MatchEventType, type MatchEvent } from "../result/MatchEvent.js";
import {
  DecidedBy,
  type DisciplineRecord,
  type MatchOutcome,
  type MatchResult,
  type Score,
} from "../result/MatchResult.js";
import { PenaltyShootoutResolver } from "../shootout/PenaltyShootoutResolver.js";
import { SituationAssessor } from "../situation/SituationAssessor.js";
import { MatchState } from "../state/MatchState.js";
import { SubstitutionManager } from "../substitution/SubstitutionManager.js";
import { type Tactics } from "@fut/domain";
import { type MatchConfig } from "../MatchSimulator.js";
import { ManualCoachController } from "./ManualCoachController.js";

/** A player's on-pitch spot for the live view (normalised 0–100 coordinates). */
export interface LivePlayer {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly pos: Position;
  readonly x: number;
  readonly y: number;
  readonly hasBall: boolean;
}

export interface LiveSnapshot {
  readonly minute: number;
  readonly status: "kickoff" | "playing" | "halftime" | "finished";
  readonly homeScore: number;
  readonly awayScore: number;
  readonly possessionTeamId: string;
  readonly players: readonly LivePlayer[];
}

/**
 * A match you can drive minute-by-minute (for a live, watchable UI) and inject
 * human coach decisions into mid-play. The loop is a resumable generator that
 * reproduces `MatchSimulator.simulate()` exactly — same seed → same result when
 * no human intervenes — so "watch" and "quick sim" are the same match.
 */
export class LiveMatch {
  private readonly positioning = new PositioningModel();
  private readonly decision = new DecisionEngine();
  private readonly assessor = new SituationAssessor();
  private readonly referee = new RefereeAdjudicator();
  private readonly shootout = new PenaltyShootoutResolver();
  private readonly registry = createResolverRegistry();

  private readonly config: MatchConfig;
  private readonly state: MatchState;
  private readonly rng: SeededRandom;
  private readonly clock: MatchClock;
  private readonly subs: SubstitutionManager;
  private readonly controllers: Record<string, CoachController>;
  private readonly stepsPerMinute: number;
  private readonly events: MatchEvent[] = [];
  private readonly gen: Generator<void, void, void>;

  private regulationScore: Score = { home: 0, away: 0 };
  private extraTimeScore: Score | undefined;
  private shootoutScore: Score | undefined;
  private _status: LiveSnapshot["status"] = "kickoff";
  private _finished = false;

  constructor(config: MatchConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.seed);
    this.state = new MatchState(
      config.home,
      config.away,
      config.matchRules,
      config.substitutionRules,
      config.tieContext,
    );
    this.clock = new MatchClock(config.matchRules);
    this.subs = new SubstitutionManager(config.substitutionRules);
    this.controllers = {
      [config.home.id]: config.homeController ?? new AiCoachController(),
      [config.away.id]: config.awayController ?? new AiCoachController(),
    };
    this.stepsPerMinute = config.stepsPerMinute ?? 3;
    this.gen = this.run();
  }

  // ---- Human interventions -------------------------------------------------
  /** Queue a substitution for a manually-controlled team (applied next minute). */
  requestSubstitution(teamId: string, outPlayerId: string, inPlayerId: string): void {
    const c = this.controllers[teamId];
    if (c instanceof ManualCoachController) c.enqueue({ kind: "substitution", outPlayerId, inPlayerId });
  }

  /** Queue a tactic change for a manually-controlled team (takes effect after a delay). */
  requestTacticChange(teamId: string, tactics: Tactics): void {
    const c = this.controllers[teamId];
    if (c instanceof ManualCoachController) c.enqueue({ kind: "tacticChange", tactics });
  }

  // ---- Driving -------------------------------------------------------------
  /** Advance the match one minute (or across a break). Returns the events produced. */
  advance(): { events: MatchEvent[]; done: boolean } {
    if (this._finished) return { events: [], done: true };
    const before = this.events.length;
    const res = this.gen.next();
    if (res.done) {
      this._finished = true;
      this._status = "finished";
    }
    return { events: this.events.slice(before), done: this._finished };
  }

  get finished(): boolean {
    return this._finished;
  }

  get status(): LiveSnapshot["status"] {
    return this._status;
  }

  get minute(): number {
    return this.state.minute;
  }

  result(): MatchResult {
    return this.buildResult();
  }

  benchFor(teamId: string): readonly { id: string; name: string; pos: Position }[] {
    return this.state
      .teamOf(teamId)
      .bench.filter((p) => {
        const ps = this.state.playerState(p.id);
        return !ps.onPitch && !ps.sentOff && !ps.injured;
      })
      .map((p) => ({ id: p.id, name: p.name, pos: p.position }));
  }

  onPitchFor(teamId: string): readonly { id: string; name: string; pos: Position }[] {
    return this.state.onPitchPlayers(teamId).map((p) => ({ id: p.id, name: p.name, pos: p.position }));
  }

  canSubstitute(teamId: string): boolean {
    return this.subs.canSubstitute(teamId, this.state.minute, this._status === "halftime");
  }

  snapshot(): LiveSnapshot {
    const players: LivePlayer[] = [];
    for (const teamId of [this.config.home.id, this.config.away.id]) {
      const side = this.state.sideOf(teamId);
      for (const p of this.state.onPitchPlayers(teamId)) {
        const z = this.state.positions.get(p.id);
        const adv = z ? this.state.grid.advancement(side, z) : 0;
        const lane = z ? z.lane : this.state.grid.centerLane;
        const x = (lane / (this.state.grid.lanes - 1)) * 100;
        const y = teamId === this.config.home.id ? 100 - adv * 100 : adv * 100;
        players.push({
          id: p.id,
          teamId,
          name: p.name,
          pos: p.position,
          x,
          y,
          hasBall: p.id === this.state.ballCarrierId,
        });
      }
    }
    return {
      minute: this.state.minute,
      status: this._status,
      homeScore: this.state.score.home,
      awayScore: this.state.score.away,
      possessionTeamId: this.state.possessionTeamId,
      players,
    };
  }

  // ---- The loop (mirrors MatchSimulator.simulate exactly) ------------------
  private *run(): Generator<void, void, void> {
    this.events.push({ minute: 0, type: MatchEventType.Kickoff, teamId: this.config.home.id });
    this.positioning.assign(this.state);

    const [firstHalf, secondHalf] = this.clock.regulationSegments() as [TimeSegment, TimeSegment];

    this._status = "playing";
    yield* this.playSegment(firstHalf);

    this.events.push({ minute: firstHalf.to, type: MatchEventType.HalfTime });
    this.runCoaches(firstHalf.to, true);
    kickoff(this.state, this.config.away.id);
    this._status = "halftime";
    yield;
    this._status = "playing";

    yield* this.playSegment(secondHalf);

    this.regulationScore = { home: this.state.score.home, away: this.state.score.away };

    if (this.config.matchRules.hasExtraTime && this.isLevel()) {
      this.events.push({
        minute: this.config.matchRules.regulationMinutes,
        type: MatchEventType.ExtraTimeStart,
      });
      const extras = this.clock.extraTimeSegments() as [TimeSegment, TimeSegment];
      kickoff(this.state, this.config.home.id);
      yield* this.playSegment(extras[0]);
      kickoff(this.state, this.config.away.id);
      yield* this.playSegment(extras[1]);
      this.extraTimeScore = {
        home: this.state.score.home - this.regulationScore.home,
        away: this.state.score.away - this.regulationScore.away,
      };
    }

    if (this.isLevel() && this.config.matchRules.hasPenaltyShootout) {
      const result = this.shootout.resolve(this.state, this.rng);
      this.shootoutScore = { home: result.homeGoals, away: result.awayGoals };
      for (const e of result.events) this.events.push(e);
    }

    this.events.push({ minute: this.state.minute, type: MatchEventType.FullTime });
  }

  private *playSegment(seg: TimeSegment): Generator<void, void, void> {
    this.state.period = seg.period;
    for (let minute = seg.from; minute <= seg.to; minute++) {
      this.state.minute = minute;
      this.runCoaches(minute, false);
      this.applyPendingTacticChanges(minute);
      for (let step = 0; step < this.stepsPerMinute; step++) {
        this.positioning.assign(this.state);
        const possessingTeamId = this.state.possessionTeamId;
        this.state.statsFor(possessingTeamId).possessionSteps += 1;
        const carrier = this.state.getPlayer(this.state.ballCarrierId)!;
        const objective = this.assessor.assess(this.state, possessingTeamId);
        const action = this.decision.choose(this.state, carrier, objective, this.rng);
        const produced = this.registry[action].resolve({ state: this.state, rng: this.rng, referee: this.referee });
        for (const e of produced) this.events.push(e);
      }
      this.applyFatigue();
      this.applyInjuries(minute);
      yield;
    }
  }

  private runCoaches(minute: number, isHalftime: boolean): void {
    for (const teamId of [this.state.homeTeam.id, this.state.awayTeam.id]) {
      const decisions = this.controllers[teamId]!.decide(this.state, teamId, this.rng);
      for (const d of decisions) {
        if (d.kind === "tacticChange") {
          const knowledge = norm(this.state.teamOf(teamId).coach.attributes.tacticalKnowledge);
          const delay = Math.max(1, Math.round(3 - knowledge * 2));
          this.state.pendingTacticChange.set(teamId, { tactics: d.tactics, effectiveMinute: minute + delay });
          this.events.push({
            minute,
            type: MatchEventType.TacticChange,
            teamId,
            params: { mentality: d.tactics.instructions.mentality },
          });
        } else if (this.subs.canSubstitute(teamId, minute, isHalftime)) {
          this.state.swapOnPitch(teamId, d.outPlayerId, d.inPlayerId);
          this.subs.record(teamId, minute, isHalftime);
          const outP = this.state.getPlayer(d.outPlayerId);
          const inP = this.state.getPlayer(d.inPlayerId);
          this.events.push({
            minute,
            type: MatchEventType.Substitution,
            teamId,
            playerId: d.inPlayerId,
            playerName: inP?.name,
            secondaryPlayerId: d.outPlayerId,
            secondaryPlayerName: outP?.name,
          });
        }
      }
    }
  }

  private applyPendingTacticChanges(minute: number): void {
    for (const teamId of [...this.state.pendingTacticChange.keys()]) {
      const pending = this.state.pendingTacticChange.get(teamId)!;
      if (minute >= pending.effectiveMinute) {
        this.state.setTactics(teamId, pending.tactics);
        this.state.pendingTacticChange.delete(teamId);
      }
    }
  }

  private applyFatigue(): void {
    for (const teamId of [this.state.homeTeam.id, this.state.awayTeam.id]) {
      const pressing = this.state.tacticsFor(teamId).instructions.pressing;
      for (const p of this.state.onPitchPlayers(teamId)) {
        const ps = this.state.playerState(p.id);
        ps.fatigue = Math.min(0.5, ps.fatigue + 0.005 + norm(p.mental.workRate) * 0.004 + pressing * 0.003);
      }
    }
  }

  private applyInjuries(minute: number): void {
    for (const teamId of [this.state.homeTeam.id, this.state.awayTeam.id]) {
      for (const player of [...this.state.onPitchPlayers(teamId)]) {
        const ps = this.state.playerState(player.id);
        const risk = 0.00014 * (1 + ps.fatigue * 3);
        if (!this.rng.chance(risk)) continue;
        ps.injured = true;
        this.events.push({ minute, type: MatchEventType.Injury, teamId, playerId: player.id, playerName: player.name });
        const replacement = this.injuryReplacement(teamId, player.position);
        if (replacement && this.subs.canSubstitute(teamId, minute, false)) {
          this.state.swapOnPitch(teamId, player.id, replacement.id);
          this.subs.record(teamId, minute, false);
          this.events.push({
            minute,
            type: MatchEventType.Substitution,
            teamId,
            playerId: replacement.id,
            playerName: replacement.name,
            secondaryPlayerId: player.id,
            secondaryPlayerName: player.name,
            params: { injury: true },
          });
        } else {
          this.state.removeInjured(player.id);
        }
      }
    }
  }

  private injuryReplacement(teamId: string, position: Position) {
    const bench = this.state
      .teamOf(teamId)
      .bench.filter((p) => {
        const ps = this.state.playerState(p.id);
        return !ps.onPitch && !ps.sentOff && !ps.injured;
      });
    if (bench.length === 0) return undefined;
    const same = bench.filter((p) => p.position === position);
    const pool = same.length > 0 ? same : bench;
    return pool.reduce((a, b) => (a.overall() >= b.overall() ? a : b));
  }

  private isLevel(): boolean {
    const agg = this.aggregate();
    return agg.home === agg.away;
  }

  private aggregate(): Score {
    const tie = this.state.tieContext;
    if (!tie) return { home: this.state.score.home, away: this.state.score.away };
    return {
      home: this.state.score.home + tie.firstLegHomeTeamGoals,
      away: this.state.score.away + tie.firstLegAwayTeamGoals,
    };
  }

  private buildResult(): MatchResult {
    return {
      seed: this.config.seed,
      homeTeamId: this.config.home.id,
      awayTeamId: this.config.away.id,
      homeTeamName: this.config.home.name,
      awayTeamName: this.config.away.name,
      homeScore: this.state.score.home,
      awayScore: this.state.score.away,
      regulationScore: this.regulationScore,
      extraTimeScore: this.extraTimeScore,
      shootoutScore: this.shootoutScore,
      outcome: this.determineOutcome(),
      timeline: this.events,
      discipline: this.buildDiscipline(),
      stats: { home: this.state.stats.home, away: this.state.stats.away },
    };
  }

  private determineOutcome(): MatchOutcome {
    const aggregate = this.config.tieContext ? this.aggregate() : undefined;
    if (this.shootoutScore) {
      const winnerTeamId =
        this.shootoutScore.home > this.shootoutScore.away ? this.config.home.id : this.config.away.id;
      return { winnerTeamId, decidedBy: DecidedBy.Shootout, aggregate };
    }
    const cmp = this.aggregate();
    if (cmp.home === cmp.away) return { decidedBy: DecidedBy.Draw, aggregate };
    const winnerTeamId = cmp.home > cmp.away ? this.config.home.id : this.config.away.id;
    const decidedBy = this.extraTimeScore !== undefined ? DecidedBy.ExtraTime : DecidedBy.Regulation;
    return { winnerTeamId, decidedBy, aggregate };
  }

  private buildDiscipline(): DisciplineRecord {
    let yellowCards = 0;
    let redCards = 0;
    const byPlayer: Record<string, { yellow: number; red: boolean }> = {};
    for (const [playerId, ps] of this.state.playerStates) {
      if (ps.yellowCards > 0 || ps.sentOff) {
        byPlayer[playerId] = { yellow: ps.yellowCards, red: ps.sentOff };
        yellowCards += ps.yellowCards;
        if (ps.sentOff) redCards += 1;
      }
    }
    return { yellowCards, redCards, byPlayer };
  }
}
