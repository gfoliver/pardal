import {
  type MatchRules,
  type Position,
  type SubstitutionRules,
  type Team,
  type TieContext,
} from "@fut/domain";
import { createResolverRegistry } from "./actions/resolvers.js";
import { kickoff } from "./actions/effects.js";
import { norm } from "./actions/probability.js";
import { MatchClock, type TimeSegment } from "./clock/MatchClock.js";
import { AiCoachController } from "./coach/AiCoachController.js";
import { type CoachController } from "./coach/CoachController.js";
import { DecisionEngine } from "./decision/DecisionEngine.js";
import { PositioningModel } from "./positioning/PositioningModel.js";
import { SeededRandom } from "./random/SeededRandom.js";
import { RefereeAdjudicator } from "./referee/RefereeAdjudicator.js";
import { MatchEventType, type MatchEvent } from "./result/MatchEvent.js";
import {
  DecidedBy,
  type DisciplineRecord,
  type MatchOutcome,
  type MatchResult,
  type Score,
} from "./result/MatchResult.js";
import { PenaltyShootoutResolver } from "./shootout/PenaltyShootoutResolver.js";
import { SituationAssessor } from "./situation/SituationAssessor.js";
import { MatchState, Period } from "./state/MatchState.js";
import { SubstitutionManager } from "./substitution/SubstitutionManager.js";

export interface MatchConfig {
  readonly home: Team;
  readonly away: Team;
  readonly seed: number;
  readonly matchRules: MatchRules;
  readonly substitutionRules: SubstitutionRules;
  readonly tieContext?: TieContext;
  readonly homeController?: CoachController;
  readonly awayController?: CoachController;
  /** Action-steps simulated per minute (default 3). */
  readonly stepsPerMinute?: number;
}

/**
 * Orchestrates a full match: the tick loop, coach interventions, refereeing,
 * extra time and the shootout. Receives all competition rules by injection, so
 * new competitions need no engine changes.
 */
export class MatchSimulator {
  private readonly positioning = new PositioningModel();
  private readonly decision = new DecisionEngine();
  private readonly assessor = new SituationAssessor();
  private readonly referee = new RefereeAdjudicator();
  private readonly shootout = new PenaltyShootoutResolver();
  private readonly registry = createResolverRegistry();

  simulate(config: MatchConfig): MatchResult {
    const rng = new SeededRandom(config.seed);
    const state = new MatchState(
      config.home,
      config.away,
      config.matchRules,
      config.substitutionRules,
      config.tieContext,
    );
    const clock = new MatchClock(config.matchRules);
    const subs = new SubstitutionManager(config.substitutionRules);
    const controllers: Record<string, CoachController> = {
      [config.home.id]: config.homeController ?? new AiCoachController(),
      [config.away.id]: config.awayController ?? new AiCoachController(),
    };
    const stepsPerMinute = config.stepsPerMinute ?? 3;
    const events: MatchEvent[] = [];

    events.push({ minute: 0, type: MatchEventType.Kickoff, teamId: config.home.id });
    this.positioning.assign(state);

    const [firstHalf, secondHalf] = clock.regulationSegments() as [
      TimeSegment,
      TimeSegment,
    ];

    // First half.
    this.playSegment(state, firstHalf, subs, controllers, rng, events, stepsPerMinute);

    // Half-time (a substitution window that may be exempt from the window count).
    events.push({ minute: firstHalf.to, type: MatchEventType.HalfTime });
    this.runCoaches(state, firstHalf.to, subs, controllers, rng, events, true);
    kickoff(state, config.away.id);

    // Second half.
    this.playSegment(state, secondHalf, subs, controllers, rng, events, stepsPerMinute);

    const regulationScore: Score = { home: state.score.home, away: state.score.away };

    // Extra time (only when the tie is level and the rules allow it).
    let extraTimeScore: Score | undefined;
    if (config.matchRules.hasExtraTime && this.isLevel(state)) {
      events.push({
        minute: config.matchRules.regulationMinutes,
        type: MatchEventType.ExtraTimeStart,
      });
      const extras = clock.extraTimeSegments() as [TimeSegment, TimeSegment];
      kickoff(state, config.home.id);
      this.playSegment(state, extras[0], subs, controllers, rng, events, stepsPerMinute);
      kickoff(state, config.away.id);
      this.playSegment(state, extras[1], subs, controllers, rng, events, stepsPerMinute);
      extraTimeScore = {
        home: state.score.home - regulationScore.home,
        away: state.score.away - regulationScore.away,
      };
    }

    // Penalty shootout (only if still level and the rules allow it).
    let shootoutScore: Score | undefined;
    if (this.isLevel(state) && config.matchRules.hasPenaltyShootout) {
      const result = this.shootout.resolve(state, rng);
      shootoutScore = { home: result.homeGoals, away: result.awayGoals };
      for (const e of result.events) events.push(e);
    }

    events.push({
      minute: state.minute,
      type: MatchEventType.FullTime,
    });

    return this.buildResult(
      config,
      state,
      regulationScore,
      extraTimeScore,
      shootoutScore,
      events,
    );
  }

  private playSegment(
    state: MatchState,
    seg: TimeSegment,
    subs: SubstitutionManager,
    controllers: Record<string, CoachController>,
    rng: SeededRandom,
    events: MatchEvent[],
    stepsPerMinute: number,
  ): void {
    state.period = seg.period;
    for (let minute = seg.from; minute <= seg.to; minute++) {
      state.minute = minute;
      this.runCoaches(state, minute, subs, controllers, rng, events, false);
      this.applyPendingTacticChanges(state, minute, events);
      for (let step = 0; step < stepsPerMinute; step++) {
        this.positioning.assign(state);
        const possessingTeamId = state.possessionTeamId;
        state.statsFor(possessingTeamId).possessionSteps += 1;
        const carrier = state.getPlayer(state.ballCarrierId)!;
        const objective = this.assessor.assess(state, possessingTeamId);
        const action = this.decision.choose(state, carrier, objective, rng);
        const produced = this.registry[action].resolve({
          state,
          rng,
          referee: this.referee,
        });
        for (const e of produced) events.push(e);
      }
      this.applyFatigue(state);
      this.applyInjuries(state, minute, subs, rng, events);
    }
  }

  /**
   * Per-minute injury check. Injury risk rises with fatigue. An injured player
   * is replaced if a substitution is available; otherwise the team plays a man
   * down. Uses the RNG in fixed order, so it stays deterministic.
   */
  private applyInjuries(
    state: MatchState,
    minute: number,
    subs: SubstitutionManager,
    rng: SeededRandom,
    events: MatchEvent[],
  ): void {
    for (const teamId of [state.homeTeam.id, state.awayTeam.id]) {
      for (const player of [...state.onPitchPlayers(teamId)]) {
        const ps = state.playerState(player.id);
        const risk = 0.00014 * (1 + ps.fatigue * 3);
        if (!rng.chance(risk)) continue;

        ps.injured = true;
        events.push({
          minute,
          type: MatchEventType.Injury,
          teamId,
          playerId: player.id,
          playerName: player.name,
        });

        const replacement = this.injuryReplacement(state, teamId, player.position);
        if (replacement && subs.canSubstitute(teamId, minute, false)) {
          state.swapOnPitch(teamId, player.id, replacement.id);
          subs.record(teamId, minute, false);
          events.push({
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
          // No substitution available — the team plays a man down.
          state.removeInjured(player.id);
        }
      }
    }
  }

  private injuryReplacement(
    state: MatchState,
    teamId: string,
    position: Position,
  ) {
    const bench = state
      .teamOf(teamId)
      .bench.filter(
        (p) =>
          !state.playerState(p.id).onPitch &&
          !state.playerState(p.id).sentOff &&
          !state.playerState(p.id).injured,
      );
    if (bench.length === 0) return undefined;
    const same = bench.filter((p) => p.position === position);
    const pool = same.length > 0 ? same : bench;
    return pool.reduce((a, b) => (a.overall() >= b.overall() ? a : b));
  }

  private runCoaches(
    state: MatchState,
    minute: number,
    subs: SubstitutionManager,
    controllers: Record<string, CoachController>,
    rng: SeededRandom,
    events: MatchEvent[],
    isHalftime: boolean,
  ): void {
    for (const teamId of [state.homeTeam.id, state.awayTeam.id]) {
      const decisions = controllers[teamId]!.decide(state, teamId, rng);
      for (const d of decisions) {
        if (d.kind === "tacticChange") {
          const knowledge = norm(state.teamOf(teamId).coach.attributes.tacticalKnowledge);
          const delay = Math.max(1, Math.round(3 - knowledge * 2));
          state.pendingTacticChange.set(teamId, {
            tactics: d.tactics,
            effectiveMinute: minute + delay,
          });
          events.push({
            minute,
            type: MatchEventType.TacticChange,
            teamId,
            params: { mentality: d.tactics.instructions.mentality },
          });
        } else if (subs.canSubstitute(teamId, minute, isHalftime)) {
          state.swapOnPitch(teamId, d.outPlayerId, d.inPlayerId);
          subs.record(teamId, minute, isHalftime);
          const outP = state.getPlayer(d.outPlayerId);
          const inP = state.getPlayer(d.inPlayerId);
          events.push({
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

  private applyPendingTacticChanges(
    state: MatchState,
    minute: number,
    events: MatchEvent[],
  ): void {
    for (const teamId of [...state.pendingTacticChange.keys()]) {
      const pending = state.pendingTacticChange.get(teamId)!;
      if (minute >= pending.effectiveMinute) {
        state.setTactics(teamId, pending.tactics);
        state.pendingTacticChange.delete(teamId);
      }
    }
    void events;
  }

  private applyFatigue(state: MatchState): void {
    for (const teamId of [state.homeTeam.id, state.awayTeam.id]) {
      const pressing = state.tacticsFor(teamId).instructions.pressing;
      for (const p of state.onPitchPlayers(teamId)) {
        const ps = state.playerState(p.id);
        ps.fatigue = Math.min(
          0.5,
          ps.fatigue + 0.005 + norm(p.mental.workRate) * 0.004 + pressing * 0.003,
        );
      }
    }
  }

  private isLevel(state: MatchState): boolean {
    const agg = this.aggregate(state);
    return agg.home === agg.away;
  }

  private aggregate(state: MatchState): Score {
    const tie = state.tieContext;
    if (!tie) return { home: state.score.home, away: state.score.away };
    return {
      home: state.score.home + tie.firstLegHomeTeamGoals,
      away: state.score.away + tie.firstLegAwayTeamGoals,
    };
  }

  private buildResult(
    config: MatchConfig,
    state: MatchState,
    regulationScore: Score,
    extraTimeScore: Score | undefined,
    shootoutScore: Score | undefined,
    events: MatchEvent[],
  ): MatchResult {
    const outcome = this.determineOutcome(
      config,
      state,
      extraTimeScore !== undefined,
      shootoutScore,
    );
    return {
      seed: config.seed,
      homeTeamId: config.home.id,
      awayTeamId: config.away.id,
      homeTeamName: config.home.name,
      awayTeamName: config.away.name,
      homeScore: state.score.home,
      awayScore: state.score.away,
      regulationScore,
      extraTimeScore,
      shootoutScore,
      outcome,
      timeline: events,
      discipline: this.buildDiscipline(state),
      stats: { home: state.stats.home, away: state.stats.away },
    };
  }

  private determineOutcome(
    config: MatchConfig,
    state: MatchState,
    extraTimePlayed: boolean,
    shootoutScore: Score | undefined,
  ): MatchOutcome {
    const aggregate = config.tieContext ? this.aggregate(state) : undefined;

    if (shootoutScore) {
      const winnerTeamId =
        shootoutScore.home > shootoutScore.away ? config.home.id : config.away.id;
      return { winnerTeamId, decidedBy: DecidedBy.Shootout, aggregate };
    }

    const cmp = this.aggregate(state);
    if (cmp.home === cmp.away) {
      return { decidedBy: DecidedBy.Draw, aggregate };
    }
    const winnerTeamId = cmp.home > cmp.away ? config.home.id : config.away.id;
    const decidedBy = extraTimePlayed ? DecidedBy.ExtraTime : DecidedBy.Regulation;
    return { winnerTeamId, decidedBy, aggregate };
  }

  private buildDiscipline(state: MatchState): DisciplineRecord {
    let yellowCards = 0;
    let redCards = 0;
    const byPlayer: Record<string, { yellow: number; red: boolean }> = {};
    for (const [playerId, ps] of state.playerStates) {
      if (ps.yellowCards > 0 || ps.sentOff) {
        byPlayer[playerId] = { yellow: ps.yellowCards, red: ps.sentOff };
        yellowCards += ps.yellowCards;
        if (ps.sentOff) redCards += 1;
      }
    }
    return { yellowCards, redCards, byPlayer };
  }
}
