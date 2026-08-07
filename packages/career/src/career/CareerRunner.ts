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
import { fallbackDev, isAvailable } from "../development/PlayerDev.js";
import { applyMatchCards, serveSuspension, type SuspensionIssued } from "../discipline/suspensions.js";
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
import { PRESEASON_DAYS, retargetBoards } from "./createCareer.js";
import type { CareerCompetition, CareerState } from "../state/CareerState.js";

function clampN(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * A side needs eleven. Below that it forfeits rather than taking the field.
 *
 * There is no squad floor stopping a manager getting here: if he ignores the expiry warnings his
 * squad shrinks, and that is his to answer for. This is only what happens on the day.
 */
export const PLAYERS_TO_FIELD = 11;

/** The conventional walkover scoreline. */
const FORFEIT_SCORE = 3;

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

  /**
   * How many players a club could actually put on the pitch today.
   *
   * The same three questions `buildMatchTeam` asks — is he registered here, does the dataset know
   * him, is he fit — because a count that disagreed with the builder would either forfeit a club
   * that could have played or hand the engine a short XI.
   */
  private fieldable(clubId: string): number {
    const club = this.state.clubs[clubId];
    if (!club) return 0;
    return club.squad.playerIds.filter(
      (id) => this.dataById.has(id) && isAvailable(this.devById.get(id) ?? fallbackDev(id)),
    ).length;
  }

  canField(clubId: string): boolean {
    return this.fieldable(clubId) >= PLAYERS_TO_FIELD;
  }

  /** Simulate one fixture and fold its result into state. */
  playFixture(comp: CareerCompetition, fixture: DatedFixture): FixtureResult {
    /*
     * A club that cannot field eleven does not take the field — it loses the fixture.
     *
     * Checked BEFORE building the teams, because `buildMatchTeam` will happily return a short XI and
     * the engine cannot play one: `Team.goalkeeper()` comes back undefined and the spatial engine
     * indexes eleven slots. Awarding the match is both the real rule and the only way this ends.
     */
    const homeCan = this.canField(fixture.homeTeamId);
    const awayCan = this.canField(fixture.awayTeamId);
    if (!homeCan || !awayCan) return this.award(comp, fixture, homeCan, awayCan);

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
   * Award a fixture nobody could play, without simulating it.
   *
   * Not routed through `record`: no match happened, so there are no injuries to process, no
   * familiarity earned and no appearances to credit. The scoreline is the conventional 3-0, and
   * `goals` stays empty because nobody scored them.
   *
   * A double no-show is `void` rather than `forfeit` — `void` contributes nothing to the table,
   * which is right when neither side turned up, whereas a 0-0 forfeit would hand both a point.
   */
  private award(comp: CareerCompetition, fixture: DatedFixture, homeCan: boolean, awayCan: boolean): FixtureResult {
    const both = !homeCan && !awayCan;
    const fr: FixtureResult = {
      round: fixture.round,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeScore: both ? 0 : homeCan ? FORFEIT_SCORE : 0,
      awayScore: both ? 0 : awayCan ? FORFEIT_SCORE : 0,
      goals: [],
      status: both ? "void" : "forfeit",
    };
    comp.results.push(fr);
    // A walkover is still a fixture the club did not play, so it SERVES a ban. Refusing to would let a
    // squad thinned by suspensions forfeit forever: the bans that helped cause the no-show would never
    // count down, and the next round would be short by the same men.
    if (this.markPlayed(comp, fixture)) this.serveSuspensions(comp, fixture);

    // Tell the manager only when it is his club — the league's other no-shows are table news.
    for (const clubId of [fixture.homeTeamId, fixture.awayTeamId]) {
      if (clubId !== this.state.managedClubId) continue;
      const short = clubId === fixture.homeTeamId ? !homeCan : !awayCan;
      this.state.inbox.push({
        id: nextId(this.state, "wo"),
        type: InboxMessageType.FixtureForfeited,
        date: { ...this.state.currentDate },
        read: false,
        params: {
          opponentId: clubId === fixture.homeTeamId ? fixture.awayTeamId : fixture.homeTeamId,
          ours: short,
          available: this.fieldable(clubId),
          needed: PLAYERS_TO_FIELD,
        },
      });
    }
    return fr;
  }

  /**
   * Fold a MatchResult into state (used by both quick-sim and a watched match):
   * append the FixtureResult, serve and issue suspensions, process injuries. When
   * the teams are supplied, per-player appearance lines (minutes + rating) are stored.
   *
   * The result itself is APPENDED unconditionally — `computeStandings` deduplicates on `fixtureKey`,
   * last write winning, so a re-record is a correction and supersedes what it corrects. Everything
   * that CHANGES a career instead of describing a match runs once and only once; see `markPlayed`.
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
    if (!this.markPlayed(comp, fixture)) return fr;

    /*
     * Serve BEFORE booking, and the order is the rule rather than a preference.
     *
     * A player carrying a ban did not take part in this fixture — that is what `isAvailable` enforced
     * when the XI was built — so this fixture is one of the matches he sits out, and serving here is
     * what counts it. Booking first would then hand the man sent off TODAY a match already served for
     * the red he has just been shown, and a one-match ban would evaporate the instant it was issued.
     */
    this.serveSuspensions(comp, fixture);
    this.applyCards(comp, result);
    // Match results live in the calendar/table, NOT the inbox — the inbox is for
    // decisions and relevant news only. Injuries (which the manager must react
    // to) still generate an inbox item inside applyInjuries.
    this.applyInjuries(result, seed);
    this.growFamiliarity(fixture.homeTeamId);
    this.growFamiliarity(fixture.awayTeamId);
    return fr;
  }

  /**
   * Claim a fixture as settled. False when it already was, and the caller must then change nothing.
   *
   * `playedFixtureIndexes` is the ledger — the same array the calendar reads to know what is left —
   * so there is no second bookkeeping to keep in step with it.
   *
   * The reason this exists: `commitUserFixture` is called by the UI, and a retry, a double-tap or a
   * re-recorded correction runs `record` twice for one fixture. That used to injure the same players
   * twice, grow both sides' tactical familiarity twice, and — once suspensions existed — hand out two
   * bans for one red card and serve two matches of somebody else's. The precedent is `computeStandings`,
   * which deduplicates for exactly this reason after a fixture recorded twice silently DOUBLED a
   * league's points.
   */
  private markPlayed(comp: CareerCompetition, fixture: DatedFixture): boolean {
    if (comp.playedFixtureIndexes.includes(fixture.fixtureIndex)) return false;
    comp.playedFixtureIndexes.push(fixture.fixtureIndex);
    return true;
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
    // Loops because a fixture his club cannot field is awarded and skipped, and the one after it may
    // be too — a squad that has run down does not recover between rounds.
    let fixtures = 0;
    while (fixtures++ < 1_000) {
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
      for (const { comp, fixture } of sameDay) this.playFixture(comp, fixture);
      // There is no match to watch if he cannot put a side out: award it and look for the next one.
      if (!this.canField(u.fixture.homeTeamId) || !this.canField(u.fixture.awayTeamId)) {
        this.playFixture(u.comp, u.fixture);
        continue;
      }
      const { home, away } = this.buildTeams(u.fixture);
      return { comp: u.comp, fixture: u.fixture, home, away, seed: this.seedFor(u.comp, u.fixture) };
    }
    return null;
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
    /*
     * Who each player belonged to THIS season, stamped on the row.
     *
     * The reason is fog, not bookkeeping. A season a player spent at our club is a season we watched, and
     * we go on knowing it after he is sold — knowledge does not evaporate with a transfer. Without the
     * stamp the only question `playerHistory` could ask is "do we know him NOW", which erased three
     * seasons of a youth graduate the day he left. Built once per rollover rather than searched per player.
     */
    const clubOf = new Map<string, string>();
    for (const [clubId, club] of Object.entries(s.clubs)) {
      for (const id of club.squad.playerIds) clubOf.set(id, clubId);
    }
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
        clubId: clubOf.get(playerId),
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
    /*
     * Forfeits count. `computeStandings` defaults to `confirmed` only, which is right for the
     * multiplayer protocol it was written for — there a forfeit is awaiting adjudication. Here it is
     * settled the moment it happens, and leaving it out would award the club that turned up nothing.
     * A `void` double no-show is still excluded, which is the point of it.
     */
    return computeStandings(comp.teamIds, comp.results, { include: ["confirmed", "forfeit"] });
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

    /*
     * 1) Where everyone finished, division by division.
     *
     * This used to be `competitions.find(c => c.kind === "league")` — the FIRST league — which was
     * correct only while there was one. With a pyramid it would judge a Série B manager against the
     * Série A table and hand every club a prize computed from the wrong league's size.
     *
     * Read BEFORE promotion and relegation move anybody, because a club is paid for where it
     * FINISHED, in the division it actually played.
     */
    const finalPosition = new Map<string, number>();
    /** Size of the division each club played in, for the prize money. */
    const divisionSize = new Map<string, number>();
    for (const div of s.structure.divisions) {
      const comp = s.competitions.find((c) => c.kind === "league" && c.divisionId === div.id);
      if (!comp) continue;
      const table = computeStandings(comp.teamIds, comp.results);
      table.forEach((row, i) => {
        finalPosition.set(row.teamId, i + 1);
        divisionSize.set(row.teamId, table.length);
      });
    }
    if (s.structure.divisions.length > 0) {
      // The board judges him on his own division's table, whichever tier that is.
      this.reviewBoard(finalPosition.get(s.managedClubId) ?? 0);
      this.applyPromotionRelegation();
    }

    // 2) Loaned players go home before anything else looks at a squad, so ageing,
    //    the season record and next season's fixtures all see the real rosters.
    returnExpiredLoans(s, this.dataById);
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
        // The size of the division this club played in, not of the whole pyramid.
        teamsInLeague: divisionSize.get(clubId),
        /*
         * The tier it will play in NEXT season, not the one it just left.
         *
         * Read after `applyPromotionRelegation` has moved the club, which is what makes relegation
         * cost anything: this pot is the one it takes into the division it is going to. Measured
         * before, two of eight relegated clubs came out RICHER than they had been in the tier above,
         * because the payroll anchors the budget and relegation never touched the payroll.
         */
        tier: s.structure.divisions.find((d) => d.id === club.divisionId)?.tier,
      });
      club.finance.feesPaid = 0;
      club.finance.feesReceived = 0;
    }
    // Same reason the budget reads the new tier: a target is relative to the division the club is
    // about to play in, and it had never been revised at all — set once at career creation and then
    // used every season to decide whether the manager keeps his job.
    retargetBoards(s.clubs, s.structure.divisions);

    // 3) Snapshot the season that just ended BEFORE ageing anyone, so the record
    //    says what the player was while he was playing it.
    this.recordSeason(season);

    // Development + aging for every player; clear transient availability.
    for (const dev of this.devById.values()) {
      const isGk = this.dataById.get(dev.playerId)?.position === Position.Goalkeeper;
      progressSeason(dev, new SeededRandom(devSeed(s.careerSeed, newSeason, dev.playerId)), isGk);
      dev.injury = undefined;
      dev.fitness = 100;
      /*
       * The yellow tally resets and the SUSPENSION does not.
       *
       * They look like one line of housekeeping and they are opposites. Accumulation is a season tally
       * by definition — three bookings in a season, not in a career — so a new season starts it at
       * zero. A ban is a debt, and it used to be wiped here alongside it: a red card in the final round
       * cost nothing whatever, which is the same bug this whole change exists to fix, only hidden one
       * matchday further along. It carries, and `carryUnservedBans` below is what keeps it servable.
       */
      dev.yellowAccumulation = {};
    }

    // 3) Contracts are NOT renewed here any more. This block used to push every
    //    expiring deal two seasons out — the manager's included — and merely
    //    announce it, which made losing a player impossible and the expiry date
    //    decorative. Expiry is now a daily concern (`contract/expiry.ts`): the
    //    manager gets warnings at 180/90/30 days and loses anyone he ignores.

    // 4) Fresh season: new fixtures/seed, cleared results, reset clock.
    s.competitions = s.competitions.map((c) => {
      /*
       * A league's entry list comes from its DIVISION, which promotion and relegation has just
       * rewritten. Reading `c.teamIds` here is what made the movement invisible: the structure knew
       * who had gone up, and the fixture list was still built from last season's twenty.
       */
      const div = c.kind === "league" ? s.structure.divisions.find((d) => d.id === c.divisionId) : undefined;
      const teamIds = div ? [...div.teamIds] : c.teamIds;
      // Every season gets the same pre-season run-up as the first.
      const fixtures = assignDates(generateFixtures(teamIds, { doubleRoundRobin: true }), { competitionId: c.id, firstDay: PRESEASON_DAYS, daysPerRound: 7 });
      return { ...c, teamIds, seed: competitionSeed(s.careerSeed, newSeason, c.id), fixtures, results: [], playedFixtureIndexes: [] };
    });
    // AFTER the new fixture lists exist, because whether a ban can still be served is a question about
    // next season's entry lists — and promotion and relegation have just rewritten them.
    this.carryUnservedBans();
    s.totalDays = Math.max(0, ...s.competitions.flatMap((c) => c.fixtures.map((f) => f.day))) + 14;
    s.currentDate = { season: newSeason, dayOfSeason: 0 };
    // The day counter winds back to 0; re-baseline so the next tick doesn't see
    // the new season as time running backwards.
    s.lastTickedDay = undefined;

    // Pre-season transfer interest in our players (decisions to handle).
    generateUserOffers(s, this.dataById, 0);
  }

  /**
   * Keep an unserved ban into the new season — unless there is no longer a competition to serve it in.
   *
   * The trap this closes: a suspension names its competition, and a relegated club stops playing that
   * competition entirely. A defender sent off in the last round of the first division would carry a
   * ban in `serie-a` into a second-division season, where no fixture can ever count it down. He would
   * be unavailable for the rest of his career, the squad count would sit one short of what the manager
   * can see, and a thin squad would start forfeiting for a reason nothing on screen explains.
   *
   * So the ban survives only where the player's club is actually entered in that competition next
   * season. Cleared otherwise, which is also the fair reading — a division he is no longer in cannot
   * go on punishing him.
   *
   * The same shape can occur MID-season, if a banned player is sold across divisions: his ban then sits
   * unservable until this runs at the rollover, which clears it. Deliberately not hooked into every
   * roster change — one rare player unavailable for the remainder of a season he was already suspended
   * in is a small wrong, and a second copy of this rule at each transfer site is a bigger one.
   */
  private carryUnservedBans(): void {
    const s = this.state;
    /** Which competitions each club is entered in next season. */
    const entered = new Map<string, Set<string>>();
    for (const comp of s.competitions) {
      for (const teamId of comp.teamIds) {
        let set = entered.get(teamId);
        if (!set) entered.set(teamId, (set = new Set()));
        set.add(comp.id);
      }
    }
    const clubOf = new Map<string, string>();
    for (const [clubId, club] of Object.entries(s.clubs)) {
      for (const id of club.squad.playerIds) clubOf.set(id, clubId);
    }
    for (const dev of this.devById.values()) {
      const ban = dev.suspension;
      if (!ban) continue;
      const clubId = clubOf.get(dev.playerId);
      // A free agent has no fixtures either. He keeps nothing; whoever signs him signs a fit player.
      if (!clubId || !entered.get(clubId)?.has(ban.competitionId)) dev.suspension = undefined;
    }
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

  /**
   * Clubs change division.
   *
   * This used to announce the result and change nothing: `div.teamIds` was never touched, so the
   * fresh fixture list below was generated from the same twenty clubs and the champion of the second
   * tier played it again. The message was the whole feature.
   *
   * Movement is a SWAP between adjacent tiers, which is what keeps each division the size it was —
   * the promoted come up into the places the relegated vacate. Both lists come off tables already
   * sorted best-to-worst, so this is deterministic without touching the rng.
   *
   * The club record carries `divisionId` too, and it has to move with the club: it is what the board
   * objective, the squad screen and next season's tables all read.
   */
  private applyPromotionRelegation(): void {
    const s = this.state;
    const divisions = [...s.structure.divisions].sort((a, b) => a.tier - b.tier);
    /** The new membership of each division, mutated pairwise as we walk down the pyramid. */
    const members = new Map<string, string[]>(divisions.map((d) => [d.id, [...d.teamIds]]));

    const tableOf = (divisionId: string) => {
      const comp = s.competitions.find((c) => c.kind === "league" && c.divisionId === divisionId);
      return comp ? computeStandings(comp.teamIds, comp.results) : undefined;
    };

    for (let i = 0; i < divisions.length - 1; i++) {
      const upper = divisions[i]!;
      const lower = divisions[i + 1]!;
      const upperTable = tableOf(upper.id);
      const lowerTable = tableOf(lower.id);
      if (!upperTable || !lowerTable) continue;

      const down = resolvePromotionRelegation(upperTable, {
        promotionSlots: 0,
        relegationSlots: upper.relegationSlots,
      }).relegated;
      const up = resolvePromotionRelegation(lowerTable, {
        promotionSlots: lower.promotionSlots,
        relegationSlots: 0,
      }).promoted;
      /*
       * Exchanged in equal numbers, even where the declared slots disagree.
       *
       * Four down and four up is symmetric by design, but a division can be short — a career built
       * from a partial dataset, or a pyramid whose bottom tier has fewer clubs than there are
       * promotion places. Sending three up and four down would shrink one league and grow the other
       * every season until one of them could not fill a fixture list.
       */
      const moved = Math.min(down.length, up.length);
      if (moved === 0) continue;
      const relegated = down.slice(down.length - moved); // the very bottom go, if fewer places than slots
      const promoted = up.slice(0, moved);

      const upperMembers = members.get(upper.id)!;
      const lowerMembers = members.get(lower.id)!;
      const relegatedSet = new Set(relegated);
      const promotedSet = new Set(promoted);
      members.set(upper.id, [...upperMembers.filter((id) => !relegatedSet.has(id)), ...promoted]);
      members.set(lower.id, [...lowerMembers.filter((id) => !promotedSet.has(id)), ...relegated]);
      for (const id of promoted) {
        const club = s.clubs[id];
        if (club) club.divisionId = upper.id;
      }
      for (const id of relegated) {
        const club = s.clubs[id];
        if (club) club.divisionId = lower.id;
      }

      // One message per exchange, naming both halves — "who came up" and "who went down" are the
      // same piece of news and reading them as two would invite the manager to look for the other.
      s.inbox.push({
        id: `promrel-${lower.id}-${s.currentDate.season}`,
        type: InboxMessageType.PromotionRelegation,
        date: { ...s.currentDate },
        read: false,
        params: { divisionId: lower.id, promoted: promoted.join(","), relegated: relegated.join(",") },
      });
    }

    s.structure = {
      ...s.structure,
      divisions: s.structure.divisions.map((d) => ({ ...d, teamIds: members.get(d.id) ?? d.teamIds })),
    };
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

  /**
   * Count one match off every ban carried by a player at either club in this fixture.
   *
   * Driven by a FIXTURE being settled rather than by the clock, because that is what a ban is measured
   * in: "two matches" means the next two his club plays, and a player banned in the league is not
   * serving it while the cup is on. Walked over the two squads rather than over every dev record, so a
   * suspended player at a club with no game today keeps his ban intact.
   */
  private serveSuspensions(comp: CareerCompetition, fixture: DatedFixture): void {
    for (const clubId of [fixture.homeTeamId, fixture.awayTeamId]) {
      for (const id of this.state.clubs[clubId]?.squad.playerIds ?? []) {
        const dev = this.devById.get(id);
        if (dev) serveSuspension(dev, comp.id);
      }
    }
  }

  /**
   * Turn the match's cards into bans, and tell the manager about his own.
   *
   * The ban lengths and the reasoning behind them live in `discipline/suspensions.ts` — this is only
   * the career's half: which competition the cards belong to, and who is worth writing to about.
   */
  private applyCards(comp: CareerCompetition, result: MatchResult): void {
    const issued: SuspensionIssued[] = applyMatchCards(result, comp.id, this.devById);
    const mine = new Set(this.state.clubs[this.state.managedClubId]?.squad.playerIds ?? []);
    for (const s of issued) {
      // Only OUR players. A rival losing a defender is not mail; it is something to notice in his team.
      if (!mine.has(s.playerId)) continue;
      this.state.inbox.push({
        id: nextId(this.state, "susp"),
        type: InboxMessageType.PlayerSuspended,
        date: { ...this.state.currentDate },
        read: false,
        params: { playerId: s.playerId, matches: s.matches, cause: s.cause, competitionId: s.competitionId },
      });
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
