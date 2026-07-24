import {
  assignDates,
  computeStandings,
  type DatedFixture,
  type FixtureResult,
  generateFixtures,
  type GoalRecord,
  matchSeed,
  type PlayerData,
  resolvePromotionRelegation,
  type StandingRow,
} from "@fut/competition";
import { MatchRules, Position, SubstitutionRules } from "@fut/domain";
import { MatchEventType, MatchSimulator, SeededRandom, type MatchResult } from "@fut/engine";
import { buildMatchTeam } from "../build/TeamBuilder.js";
import { progressSeason } from "../development/DevelopmentEngine.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { InboxMessageType } from "../inbox/types.js";
import { competitionSeed, devSeed } from "../rng/seeds.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

let inboxCounter = 0;

function clampN(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

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
    this.settleFinances(played);
    return played;
  }

  /** Credit matchday/tv revenue to clubs that played; debit weekly wages to all. */
  private settleFinances(played: readonly FixtureResult[]): void {
    for (const fr of played) {
      const home = this.state.clubs[fr.homeTeamId];
      const away = this.state.clubs[fr.awayTeamId];
      if (home) home.finance.balance += home.finance.revenue.matchdayPerHomeGame + home.finance.revenue.tvPerRound;
      if (away) away.finance.balance += away.finance.revenue.tvPerRound;
    }
    for (const club of Object.values(this.state.clubs)) club.finance.balance -= this.wageBill(club.id);
  }

  wageBill(clubId: string): number {
    const club = this.state.clubs[clubId];
    if (!club) return 0;
    let sum = 0;
    for (const pid of club.squad.playerIds) sum += this.state.contracts[pid]?.wage ?? 0;
    return sum;
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

  /**
   * End-of-season rollover: prize money, board review (possible sack), promotion/
   * relegation, per-player development + aging, contract renewals, then a fresh
   * fixture list for the new season. Deterministic from the career seed.
   */
  rolloverSeason(): void {
    const s = this.state;
    const season = s.currentDate.season;
    const newSeason = season + 1;

    // 1) Prize money by final league position + board review.
    const league = s.competitions.find((c) => c.kind === "league");
    if (league) {
      const table = computeStandings(league.teamIds, league.results);
      const n = table.length;
      table.forEach((row, i) => {
        const club = s.clubs[row.teamId];
        if (club) club.finance.balance += (n - i) * 500_000;
      });
      this.reviewBoard(table.findIndex((r) => r.teamId === s.managedClubId) + 1);
      this.applyPromotionRelegation();
    }

    // 2) Development + aging for every player; clear transient availability.
    for (const dev of this.devById.values()) {
      const isGk = this.dataById.get(dev.playerId)?.position === Position.Goalkeeper;
      progressSeason(dev, new SeededRandom(devSeed(s.careerSeed, newSeason, dev.playerId)), isGk);
      dev.injury = undefined;
      dev.suspension = undefined;
      dev.fitness = 100;
      dev.yellowAccumulation = {};
    }

    // 3) Auto-renew expiring contracts (AI); the UI intercepts the user's own.
    for (const [pid, c] of Object.entries(s.contracts)) {
      if (c.expiry.season <= newSeason) {
        s.contracts[pid] = { ...c, expiry: { season: newSeason + 2, dayOfSeason: 0 } };
        if (c.clubId === s.managedClubId) {
          s.inbox.push({ id: `renew-${pid}-${newSeason}`, type: InboxMessageType.ContractRenewed, date: { season: newSeason, dayOfSeason: 0 }, read: false, params: { playerId: pid } });
        }
      }
    }

    // 4) Fresh season: new fixtures/seed, cleared results, reset clock.
    s.competitions = s.competitions.map((c) => {
      const fixtures = assignDates(generateFixtures(c.teamIds, { doubleRoundRobin: true }), { competitionId: c.id, firstDay: 0, daysPerRound: 7 });
      return { ...c, seed: competitionSeed(s.careerSeed, newSeason, c.id), fixtures, results: [], playedFixtureIndexes: [] };
    });
    s.totalDays = Math.max(0, ...s.competitions.flatMap((c) => c.fixtures.map((f) => f.day))) + 14;
    s.currentDate = { season: newSeason, dayOfSeason: 0 };
  }

  private reviewBoard(finalPosition: number): void {
    const club = this.state.clubs[this.state.managedClubId];
    if (!club || finalPosition < 1) return;
    const target = club.objectives.leaguePositionTarget;
    const delta = finalPosition <= target ? 15 : -(finalPosition - target) * 6;
    club.objectives.confidence = clampN(club.objectives.confidence + delta, 0, 100);
    if (club.objectives.confidence < 20) {
      this.state.managerSacked = true;
      this.state.inbox.push({ id: `sack-${this.state.currentDate.season}`, type: InboxMessageType.BoardSacked, date: { ...this.state.currentDate }, read: false, params: { finalPosition, target } });
    }
  }

  private applyPromotionRelegation(): void {
    for (const div of this.state.structure.divisions) {
      const comp = this.state.competitions.find((c) => c.kind === "league" && c.divisionId === div.id);
      if (!comp || (div.promotionSlots === 0 && div.relegationSlots === 0)) continue;
      const table = computeStandings(comp.teamIds, comp.results);
      const { promoted, relegated } = resolvePromotionRelegation(table, { promotionSlots: div.promotionSlots, relegationSlots: div.relegationSlots });
      if (promoted.length || relegated.length) {
        this.state.inbox.push({ id: `promrel-${div.id}-${this.state.currentDate.season}`, type: InboxMessageType.PromotionRelegation, date: { ...this.state.currentDate }, read: false, params: { divisionId: div.id, promoted: promoted.join(","), relegated: relegated.join(",") } });
      }
    }
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
