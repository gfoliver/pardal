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
import { MatchRules, Position, SubstitutionRules, type Team } from "@fut/domain";
import { MatchEventType, MatchSimulator, SeededRandom, type MatchResult } from "@fut/engine";
import { buildMatchTeam } from "../build/TeamBuilder.js";
import { resolveSquadNumbers } from "../squad/shirtNumbers.js";
import { aggregatePlayerStats, computeMatchLines } from "../stats/PlayerStats.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { MONTHS_PER_SEASON, monthlyWageBill, seasonBudget } from "../club/Finance.js";
import { progressSeason } from "../development/DevelopmentEngine.js";
import { generateUserOffers, returnExpiredLoans } from "../transfer/TransferMarket.js";
import { pruneListings } from "../transfer/TransferList.js";
import { tickDay } from "../time/tickDay.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import { InboxMessageType } from "../inbox/types.js";
import { competitionSeed, devSeed } from "../rng/seeds.js";
import { nextId } from "../state/ids.js";
import { PRESEASON_DAYS } from "./createCareer.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

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

  /** A club's match-day team, wearing the squad numbers it actually wears. */
  private teamFor(clubId: string): Team {
    return buildMatchTeam(this.state.clubs[clubId]!, this.dataById, this.devById, resolveSquadNumbers(this.state, this.dataById, clubId));
  }

  /** Simulate one fixture and fold its result into state. */
  playFixture(comp: CareerCompetition, fixture: DatedFixture): FixtureResult {
    const home = this.teamFor(fixture.homeTeamId);
    const away = this.teamFor(fixture.awayTeamId);
    const seed = matchSeed(comp.seed, fixture.fixtureIndex);
    const result = this.simulator.simulate({
      home,
      away,
      seed,
      matchRules: MatchRules.league(),
      substitutionRules: this.subRules,
    });
    return this.record(comp, fixture, result, seed, { home, away });
  }

  /**
   * Fold a MatchResult into state (used by both quick-sim and a watched match):
   * append the FixtureResult, process injuries, emit an inbox result. When the
   * teams are supplied, per-player appearance lines (minutes + rating) are stored.
   */
  record(comp: CareerCompetition, fixture: DatedFixture, result: MatchResult, seed: number, teams?: { home: Team; away: Team }): FixtureResult {
    const goals: GoalRecord[] = result.timeline
      .filter((e) => e.type === MatchEventType.Goal)
      .map((e) => ({ teamId: e.teamId!, scorerId: e.playerId!, assistId: e.secondaryPlayerId, penalty: Boolean(e.params?.penalty), minute: e.minute }));

    const fr: FixtureResult = {
      round: fixture.round,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      goals,
      players: teams ? computeMatchLines(teams.home, teams.away, result) : undefined,
    };
    comp.results.push(fr);
    comp.playedFixtureIndexes.push(fixture.fixtureIndex);

    // Match results live in the calendar/table, NOT the inbox — the inbox is for
    // decisions and relevant news only. Injuries (which the manager must react
    // to) still generate an inbox item inside applyInjuries.
    this.applyInjuries(result, seed);
    this.growFamiliarity(fixture.homeTeamId);
    this.growFamiliarity(fixture.awayTeamId);
    return fr;
  }

  private static readonly FAMILIARITY_GAIN = 4;
  private static readonly FAMILIARITY_DECAY = 1;
  private static readonly FAMILIARITY_FLOOR = 20;
  private static readonly FAMILIARITY_CEILING = 100;

  /**
   * A side that plays its active tactic gets more drilled in it; every other
   * saved tactic goes slightly stale — the cost of keeping several on file
   * instead of just one.
   */
  private growFamiliarity(clubId: string): void {
    const club = this.state.clubs[clubId];
    if (!club) return;
    for (const t of club.tacticSlots) {
      t.familiarity =
        t.id === club.activeTacticId
          ? Math.min(CareerRunner.FAMILIARITY_CEILING, t.familiarity + CareerRunner.FAMILIARITY_GAIN)
          : Math.max(CareerRunner.FAMILIARITY_FLOOR, t.familiarity - CareerRunner.FAMILIARITY_DECAY);
    }
  }

  /** Advance to the next match day, quick-simming every fixture on it. */
  advanceToNextMatchDay(): FixtureResult[] {
    const pending = this.unplayed();
    if (pending.length === 0) return [];
    const day = pending[0]!.fixture.day;
    this.moveTo(day);
    this.healInjuries();
    const played: FixtureResult[] = [];
    for (const { comp, fixture } of pending) {
      if (fixture.day !== day) break; // sorted → all of this day are contiguous at the front
      played.push(this.playFixture(comp, fixture));
    }
    return played;
  }

  /**
   * Nothing settles per round any more.
   *
   * Matches used to credit matchday and TV income and debit a week's wages off a cash
   * balance. That whole loop existed to produce one number once a year — the next season's
   * transfer budget — and going into the red had no consequence at all. The budget is now
   * set at the rollover directly, from the payroll and where the club finished, and wages
   * are charged against it annualised rather than trickled out weekly.
   */

  // --- user's own fixture (watch flow) ------------------------------------
  /** Per-match seed for a fixture (same one quick-sim uses). */
  seedFor(comp: CareerCompetition, fixture: DatedFixture): number {
    return matchSeed(comp.seed, fixture.fixtureIndex);
  }

  /** Build both domain teams for a fixture (for the watch engine or a report). */
  buildTeams(fixture: DatedFixture): { home: import("@fut/domain").Team; away: import("@fut/domain").Team } {
    return {
      home: this.teamFor(fixture.homeTeamId),
      away: this.teamFor(fixture.awayTeamId),
    };
  }

  /**
   * Fast-forward (quick-simming AI matches) up to the managed club's next
   * fixture WITHOUT playing it, so the UI can watch it. Returns that fixture,
   * its teams and seed — or null if the season is over.
   */
  prepareNextUserFixture(): { comp: CareerCompetition; fixture: DatedFixture; home: import("@fut/domain").Team; away: import("@fut/domain").Team; seed: number } | null {
    const u = this.nextUserFixture();
    if (!u) return null;
    const targetDay = u.fixture.day;
    // Play all full match days strictly before the user's day.
    let guard = 0;
    while (guard++ < 10_000) {
      const pending = this.unplayed();
      if (pending.length === 0 || pending[0]!.fixture.day >= targetDay) break;
      this.advanceToNextMatchDay();
    }
    // On the user's day, play the AI fixtures only.
    this.moveTo(targetDay);
    this.healInjuries();
    const sameDay = this.unplayed().filter((p) => p.fixture.day === targetDay && p.fixture !== u.fixture);
    const aiResults: FixtureResult[] = [];
    for (const { comp, fixture } of sameDay) aiResults.push(this.playFixture(comp, fixture));
    const { home, away } = this.buildTeams(u.fixture);
    return { comp: u.comp, fixture: u.fixture, home, away, seed: this.seedFor(u.comp, u.fixture) };
  }

  /** Fold a watched user fixture's result back into the season. */
  commitUserFixture(comp: CareerCompetition, fixture: DatedFixture, result: MatchResult): FixtureResult {
    return this.record(comp, fixture, result, this.seedFor(comp, fixture), this.buildTeams(fixture));
  }

  wageBill(clubId: string): number {
    return monthlyWageBill(this.state, clubId);
  }

  /** Quick-sim the whole season (AI + user), day by day. */
  simulateSeason(): void {
    let guard = 0;
    while (!this.seasonComplete && guard++ < 10_000) this.advanceToNextMatchDay();
  }

  /**
   * What the calendar is waiting on RIGHT NOW, without mutating.
   *
   * "userMatch" only once the manager's fixture is actually today — it used to
   * fire as soon as his game was the next one on the list, which hid the
   * advance button for the whole week leading up to it and left him with
   * nothing to press but "play".
   *
   * Transfer business no longer halts time at all. It used to return a
   * "decision" stop forever, and since nothing could expire without the clock
   * moving, ignoring one bid froze the entire save. Offers carry their own
   * deadline now: the world goes on and the chance is simply lost.
   */
  peekNextStop(): "userMatch" | "ai" | "seasonEnd" {
    const pending = this.unplayed();
    if (pending.length === 0) return "seasonEnd";
    const day = pending[0]!.fixture.day;
    if (day > this.state.currentDate.dayOfSeason) return "ai"; // still days to run
    const id = this.state.managedClubId;
    const userOnDay = pending.some((p) => p.fixture.day === day && (p.fixture.homeTeamId === id || p.fixture.awayTeamId === id));
    return userOnDay ? "userMatch" : "ai";
  }

  /**
   * Advance the calendar by ONE day.
   *
   * It used to jump straight to the next match day, which made a "day by day"
   * advance button move a week per press: the season lurched from fixture to
   * fixture and the manager never saw the days in between — no sense of a week
   * passing, and no room for anything to happen on a Tuesday.
   *
   * Now it steps a single day, never stepping OVER a fixture day, and plays
   * whatever falls on the day it lands on. Arriving at the manager's own
   * fixture stops without playing it: he must take the game himself.
   */
  advanceDay(): { day: number; blocked: "userMatch" | "seasonEnd" | null } {
    const pending = this.unplayed();
    const today = this.state.currentDate.dayOfSeason;
    if (pending.length === 0) return { day: today, blocked: "seasonEnd" };

    // One day forward — but never past a fixture, or we'd skip a match day.
    const day = Math.min(today + 1, pending[0]!.fixture.day);
    this.moveTo(day);
    this.healInjuries();

    const todays = pending.filter((p) => p.fixture.day === day);
    const managed = this.state.managedClubId;
    if (todays.some((p) => p.fixture.homeTeamId === managed || p.fixture.awayTeamId === managed)) {
      return { day, blocked: "userMatch" };
    }

    todays.forEach(({ comp, fixture }) => this.playFixture(comp, fixture));
    return { day, blocked: null };
  }

  /**
   * Write one row per player for the season just played.
   *
   * There was no history at all before this: `progressSeason` mutated current
   * ability in place, so a manager could watch a 19-year-old become a 24-year-old
   * with nothing to show for it. Append-only — a past season is never rewritten.
   */
  private recordSeason(season: number): void {
    const s = this.state;
    const history = (s.playerHistory ??= {});
    for (const [playerId, dev] of this.devById) {
      const data = this.dataById.get(playerId);
      if (!data) continue;
      const rows = (history[playerId] ??= []);
      if (rows.some((r) => r.season === season)) continue; // idempotent
      const stats = aggregatePlayerStats(s.competitions, playerId);
      rows.push({
        season,
        age: dev.ageAtSeasonStart,
        ca: Math.round(dev.currentAbility),
        overall: Math.round(effectiveOverall(data, dev)),
        appearances: stats.appearances,
        goals: stats.goals,
      });
    }
  }

  /**
   * Move the clock, then let the time-driven pass catch up.
   *
   * Every date change goes through here on purpose. Hanging `tickDay` off one
   * entry point instead meant a manager who quick-simmed (`advance`) never got a
   * scouting report, because that path moves the calendar without touching the
   * one place the tick lived.
   */
  private moveTo(dayOfSeason: number): void {
    this.state.currentDate = { ...this.state.currentDate, dayOfSeason };
    tickDay(this.state, this.dataById);
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

    // 1) Where everyone finished — it feeds both the board review and next season's
    //    budgets, so it is read once here rather than recomputed per club.
    const league = s.competitions.find((c) => c.kind === "league");
    const finalPosition = new Map<string, number>();
    let teamsInLeague = 0;
    if (league) {
      const table = computeStandings(league.teamIds, league.results);
      teamsInLeague = table.length;
      table.forEach((row, i) => finalPosition.set(row.teamId, i + 1));
      this.reviewBoard((finalPosition.get(s.managedClubId) ?? 0));
      this.applyPromotionRelegation();
    }

    // 2) Loaned players go home before anything else looks at a squad, so ageing,
    //    the season record and next season's fixtures all see the real rosters.
    returnExpiredLoans(s);
    // Housekeeping only: `activeListings` already ignores a listing whose player has
    // left, so this changes nothing anybody can observe — it just stops the array
    // carrying every sale of the career forever.
    pruneListings(s);

    // A fresh pot, and the season's spending resets with it. Prize money is paid HERE, as
    // budget rather than as cash: finishing well buys next season's signings, which is the
    // only thing money in this game was ever able to do.
    //
    // Computed after loans come home, so a club is budgeting for the squad it will actually
    // pay — the payroll is the anchor and a returning player is back on the books.
    for (const clubId of Object.keys(s.clubs)) {
      const club = s.clubs[clubId]!;
      club.finance.annualBudget = seasonBudget(s.careerSeed, clubId, monthlyWageBill(s, clubId) * MONTHS_PER_SEASON, {
        finalPosition: finalPosition.get(clubId),
        teamsInLeague,
      });
      club.finance.feesPaid = 0;
      club.finance.feesReceived = 0;
    }

    // 3) Snapshot the season that just ended BEFORE ageing anyone, so the record
    //    says what the player was while he was playing it.
    this.recordSeason(season);

    // Development + aging for every player; clear transient availability.
    for (const dev of this.devById.values()) {
      const isGk = this.dataById.get(dev.playerId)?.position === Position.Goalkeeper;
      progressSeason(dev, new SeededRandom(devSeed(s.careerSeed, newSeason, dev.playerId)), isGk);
      dev.injury = undefined;
      dev.suspension = undefined;
      dev.fitness = 100;
      dev.yellowAccumulation = {};
    }

    // 3) Contracts are NOT renewed here any more. This block used to push every
    //    expiring deal two seasons out — the manager's included — and merely
    //    announce it, which made losing a player impossible and the expiry date
    //    decorative. Expiry is now a daily concern (`contract/expiry.ts`): the
    //    manager gets warnings at 180/90/30 days and loses anyone he ignores.

    // 4) Fresh season: new fixtures/seed, cleared results, reset clock.
    s.competitions = s.competitions.map((c) => {
      // Every season gets the same pre-season run-up as the first.
      const fixtures = assignDates(generateFixtures(c.teamIds, { doubleRoundRobin: true }), { competitionId: c.id, firstDay: PRESEASON_DAYS, daysPerRound: 7 });
      return { ...c, seed: competitionSeed(s.careerSeed, newSeason, c.id), fixtures, results: [], playedFixtureIndexes: [] };
    });
    s.totalDays = Math.max(0, ...s.competitions.flatMap((c) => c.fixtures.map((f) => f.day))) + 14;
    s.currentDate = { season: newSeason, dayOfSeason: 0 };
    // The day counter winds back to 0; re-baseline so the next tick doesn't see
    // the new season as time running backwards.
    s.lastTickedDay = undefined;

    // Pre-season transfer interest in our players (decisions to handle).
    generateUserOffers(s, this.dataById, 0);
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
      // Only the manager's OWN players' injuries are inbox-worthy news.
      const mine = this.state.clubs[this.state.managedClubId]?.squad.playerIds.includes(e.playerId);
      if (mine) {
        this.state.inbox.push({
          id: nextId(this.state, "inj"),
          type: InboxMessageType.PlayerInjured,
          date: { ...this.state.currentDate },
          read: false,
          params: { playerId: e.playerId, days: outDays },
        });
      }
    }
  }
}
