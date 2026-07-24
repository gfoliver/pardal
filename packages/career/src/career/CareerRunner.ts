import {
  computeStandings,
  type DatedFixture,
  type FixtureResult,
  type GoalRecord,
  matchSeed,
  type PlayerData,
  type StandingRow,
} from "@fut/competition";
import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, SeededRandom, type MatchResult } from "@fut/engine";
import { buildMatchTeam } from "../build/TeamBuilder.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { InboxMessageType } from "../inbox/types.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

let inboxCounter = 0;

/**
 * Drives a career season forward, day by day, over the existing partial-friendly
 * competition primitives (fixtures carry `round`/`day`; standings recompute from
 * any prefix of results). AI matches are quick-simmed; the UI can instead hand a
 * user fixture off to the watch engine and feed the result back via `record`.
 * Deterministic: every fixture is seeded by matchSeed(competitionSeed, index).
 */
export class CareerRunner {
  private readonly simulator = new MatchSimulator();
  private readonly devById: Map<string, PlayerDev>;
  private readonly subRules: SubstitutionRules;

  constructor(
    readonly state: CareerState,
    private readonly dataById: ReadonlyMap<string, PlayerData>,
    options: { substitutionRules?: SubstitutionRules } = {},
  ) {
    this.devById = new Map(Object.values(state.playerDev).map((d) => [d.playerId, d]));
    this.subRules = options.substitutionRules ?? SubstitutionRules.brasileirao();
  }

  /** Unplayed fixtures across all competitions, earliest day first. */
  private unplayed(): { comp: CareerCompetition; fixture: DatedFixture }[] {
    const out: { comp: CareerCompetition; fixture: DatedFixture }[] = [];
    for (const comp of this.state.competitions) {
      const played = new Set(comp.playedFixtureIndexes);
      for (const f of comp.fixtures) if (!played.has(f.fixtureIndex)) out.push({ comp, fixture: f });
    }
    return out.sort((a, b) => a.fixture.day - b.fixture.day || a.fixture.fixtureIndex - b.fixture.fixtureIndex);
  }

  /** The managed club's next unplayed fixture, or null if the season is done. */
  nextUserFixture(): { comp: CareerCompetition; fixture: DatedFixture } | null {
    const id = this.state.managedClubId;
    return this.unplayed().find((u) => u.fixture.homeTeamId === id || u.fixture.awayTeamId === id) ?? null;
  }

  get seasonComplete(): boolean {
    return this.unplayed().length === 0;
  }

  /** Simulate one fixture and fold its result into state. */
  playFixture(comp: CareerCompetition, fixture: DatedFixture): FixtureResult {
    const home = buildMatchTeam(this.state.clubs[fixture.homeTeamId]!, this.dataById, this.devById);
    const away = buildMatchTeam(this.state.clubs[fixture.awayTeamId]!, this.dataById, this.devById);
    const seed = matchSeed(comp.seed, fixture.fixtureIndex);
    const result = this.simulator.simulate({
      home,
      away,
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: this.subRules,
    });
    return this.record(comp, fixture, result, seed);
  }

  /**
   * Fold a MatchResult into state (used by both quick-sim and a watched match):
   * append the FixtureResult, process injuries, emit an inbox result.
   */
  record(comp: CareerCompetition, fixture: DatedFixture, result: MatchResult, seed: number): FixtureResult {
    const goals: GoalRecord[] = result.timeline
      .filter((e) => e.type === MatchEventType.Goal)
      .map((e) => ({ teamId: e.teamId!, scorerId: e.playerId!, assistId: e.secondaryPlayerId, penalty: Boolean(e.params?.penalty) }));

    const fr: FixtureResult = {
      round: fixture.round,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      goals,
    };
    comp.results.push(fr);
    comp.playedFixtureIndexes.push(fixture.fixtureIndex);

    this.applyInjuries(result, seed);
    this.state.inbox.push({
      id: `res-${inboxCounter++}`,
      type: InboxMessageType.MatchResult,
      date: { ...this.state.currentDate },
      read: false,
      params: {
        competitionId: comp.id,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
      },
    });
    return fr;
  }

  /** Advance to the next match day, quick-simming every fixture on it. */
  advanceToNextMatchDay(): FixtureResult[] {
    const pending = this.unplayed();
    if (pending.length === 0) return [];
    const day = pending[0]!.fixture.day;
    this.state.currentDate = { ...this.state.currentDate, dayOfSeason: day };
    this.healInjuries();
    const played: FixtureResult[] = [];
    for (const { comp, fixture } of pending) {
      if (fixture.day !== day) break; // sorted → all of this day are contiguous at the front
      played.push(this.playFixture(comp, fixture));
    }
    return played;
  }

  /** Quick-sim the whole season (AI + user), day by day. */
  simulateSeason(): void {
    let guard = 0;
    while (!this.seasonComplete && guard++ < 10_000) this.advanceToNextMatchDay();
  }

  /** Current table for a competition, recomputed from results (never stored). */
  table(competitionId: string): StandingRow[] {
    const comp = this.state.competitions.find((c) => c.id === competitionId);
    if (!comp) return [];
    return computeStandings(comp.teamIds, comp.results);
  }

  // --- availability -------------------------------------------------------
  private healInjuries(): void {
    const today = this.state.currentDate;
    for (const dev of this.devById.values()) {
      if (dev.injury && dev.injury.outUntil.season <= today.season && dev.injury.outUntil.dayOfSeason <= today.dayOfSeason) {
        dev.injury = undefined;
      }
    }
  }

  private applyInjuries(result: MatchResult, seed: number): void {
    const rng = new SeededRandom((seed ^ 0x5f3759df) >>> 0);
    for (const e of result.timeline) {
      if (e.type !== MatchEventType.Injury || !e.playerId) continue;
      const dev = this.devById.get(e.playerId);
      if (!dev) continue;
      const outDays = 6 + rng.int(40);
      dev.injury = { type: "match", outUntil: { season: this.state.currentDate.season, dayOfSeason: this.state.currentDate.dayOfSeason + outDays } };
      this.state.inbox.push({
        id: `inj-${inboxCounter++}`,
        type: InboxMessageType.PlayerInjured,
        date: { ...this.state.currentDate },
        read: false,
        params: { playerId: e.playerId, days: outDays },
      });
    }
  }
}
