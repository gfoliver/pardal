import type { LeagueData, PlayerData, StandingRow } from "@fut/competition";
import type { Team } from "@fut/domain";
import { apply } from "../command/apply.js";
import type { CareerCommand } from "../command/CareerCommand.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import type { Contract } from "../contract/Contract.js";
import { OfferStatus } from "../transfer/types.js";
import { playerValue, respondToOffer, userBid } from "../transfer/TransferMarket.js";
import { isAvailable } from "../development/PlayerDev.js";
import type { Finance } from "../club/Finance.js";
import type { InboxMessage } from "../inbox/types.js";
import { runTransferWindow, type CompletedTransfer } from "../transfer/TransferMarket.js";
import type { CareerCompetition, CareerSnapshot, CareerState } from "../state/CareerState.js";
import { civilOf, daysFromCivil, DEFAULT_START } from "../calendar/dates.js";
import { CareerRunner } from "./CareerRunner.js";
import { createCareer, indexPlayers, type NewCareerOptions } from "./createCareer.js";

/** A transfer-market row (another club's player) shaped for the UI. */
export interface TransferTarget {
  readonly playerId: string;
  readonly name: string;
  readonly clubId: string;
  readonly clubShort: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly value: number;
  readonly scouted: boolean;
  readonly potentialStars?: number;
}

/** A squad row shaped for the UI (data + live dev/contract/availability). */
export interface SquadEntry {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly available: boolean;
  readonly injured: boolean;
  readonly currentAbility: number;
  readonly potentialAbility: number;
  readonly contract?: Contract;
}

/**
 * The single clean entry point the UI drives. Wraps the pure state + the season
 * runner: reads return UI-ready shapes; mutations go through either the pure
 * command reducer (`dispatch`) or the deterministic runner (advance/rollover/
 * watch flow). `snapshot()` is the serializable save.
 */
export class Career {
  private state: CareerState;
  private runner: CareerRunner;

  constructor(
    state: CareerState,
    private readonly dataById: ReadonlyMap<string, PlayerData>,
  ) {
    // Migrate older saves that predate newer fields.
    if (state.startEpochDay == null) {
      (state as { startEpochDay: number }).startEpochDay = daysFromCivil(DEFAULT_START.year, DEFAULT_START.month, DEFAULT_START.day);
    }
    if (state.scoutedPlayerIds == null) (state as { scoutedPlayerIds: string[] }).scoutedPlayerIds = [];
    this.state = state;
    this.runner = new CareerRunner(state, dataById);
  }

  static create(league: LeagueData, opts: NewCareerOptions): Career {
    return new Career(createCareer(league, opts), indexPlayers(league));
  }

  /** Rehydrate from a save; base player data comes from the dataset, not the save. */
  static load(snapshot: CareerSnapshot, league: LeagueData): Career {
    return new Career(snapshot, indexPlayers(league));
  }

  // --- reads --------------------------------------------------------------
  snapshot(): CareerSnapshot {
    return this.state;
  }
  get managedClubId(): string {
    return this.state.managedClubId;
  }
  get sacked(): boolean {
    return Boolean(this.state.managerSacked);
  }
  get seasonComplete(): boolean {
    return this.runner.seasonComplete;
  }
  get currentDate() {
    return this.state.currentDate;
  }
  /** Real Gregorian date for a SeasonDate (defaults to today in-career). */
  civilDate(d: import("../time.js").SeasonDate = this.state.currentDate) {
    return civilOf(this.state.startEpochDay, d);
  }
  get startEpochDay(): number {
    return this.state.startEpochDay;
  }
  playerName(id: string): string {
    return this.dataById.get(id)?.name ?? id;
  }
  clubName(id: string): string {
    return this.state.clubs[id]?.name ?? id;
  }
  clubShort(id: string): string {
    return this.state.clubs[id]?.shortName ?? id;
  }
  table(competitionId: string): StandingRow[] {
    return this.runner.table(competitionId);
  }
  inbox(): readonly InboxMessage[] {
    return this.state.inbox;
  }
  unreadCount(): number {
    return this.state.inbox.reduce((n, m) => n + (m.read ? 0 : 1), 0);
  }
  finances(clubId = this.state.managedClubId): Finance | null {
    return this.state.clubs[clubId]?.finance ?? null;
  }
  nextUserFixture(): { comp: CareerCompetition; fixture: import("@fut/competition").DatedFixture } | null {
    return this.runner.nextUserFixture();
  }
  squad(clubId = this.state.managedClubId): SquadEntry[] {
    const club = this.state.clubs[clubId];
    if (!club) return [];
    return club.squad.playerIds
      .map((id) => {
        const data = this.dataById.get(id)!;
        const dev = this.state.playerDev[id];
        return {
          playerId: id,
          name: data.name,
          position: data.position,
          age: dev?.ageAtSeasonStart ?? data.age,
          overall: Math.round(effectiveOverall(data, dev)),
          available: dev ? isAvailable(dev) : true,
          injured: Boolean(dev?.injury),
          currentAbility: dev?.currentAbility ?? 0,
          potentialAbility: dev?.potentialAbility ?? 0,
          contract: this.state.contracts[id],
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }

  // --- transfers / scouting ----------------------------------------------
  /** Buyable players at other clubs (potential shown only if scouted). */
  transferTargets(): TransferTarget[] {
    const scouted = new Set(this.state.scoutedPlayerIds);
    const out: TransferTarget[] = [];
    for (const [clubId, club] of Object.entries(this.state.clubs)) {
      if (clubId === this.state.managedClubId) continue;
      for (const id of club.squad.playerIds) {
        const data = this.dataById.get(id);
        const dev = this.state.playerDev[id];
        if (!data) continue;
        out.push({
          playerId: id,
          name: data.name,
          clubId,
          clubShort: club.shortName,
          position: data.position,
          age: dev?.ageAtSeasonStart ?? data.age,
          overall: Math.round(effectiveOverall(data, dev)),
          value: playerValue(this.state, this.dataById, id),
          scouted: scouted.has(id),
          potentialStars: scouted.has(id) && dev ? Math.max(1, Math.round(dev.potentialAbility / 40)) : undefined,
        });
      }
    }
    return out;
  }
  /** Pending offers for the manager's players (enriched for the UI). */
  pendingOffers() {
    return this.state.transfers.offers
      .filter((o) => o.status === OfferStatus.Pending && o.toClubId === this.state.managedClubId)
      .map((o) => ({ ...o, playerName: this.playerName(o.playerId), fromClubName: this.clubName(o.fromClubId) }));
  }
  get transferBudget(): number {
    return this.state.clubs[this.state.managedClubId]?.finance.transferBudget ?? 0;
  }
  makeBid(playerId: string, fee: number): { accepted: boolean } {
    return userBid(this.state, this.dataById, playerId, fee);
  }
  respondOffer(offerId: string, accept: boolean): void {
    respondToOffer(this.state, offerId, accept);
  }
  renewContract(playerId: string, wage: number, years: number): void {
    const c = this.state.contracts[playerId];
    if (!c) return;
    this.state.contracts[playerId] = { ...c, wage, expiry: { season: this.state.currentDate.season + years, dayOfSeason: 0 }, signedOn: { ...this.state.currentDate } };
  }
  scout(playerId: string): void {
    if (!this.state.scoutedPlayerIds.includes(playerId)) this.state.scoutedPlayerIds.push(playerId);
  }

  // --- mutations ----------------------------------------------------------
  /** Pure command (inbox/tactics/…); replaces state and re-seats the runner. */
  dispatch(command: CareerCommand): void {
    this.state = apply(this.state, command);
    this.runner = new CareerRunner(this.state, this.dataById);
  }

  /** Quick-sim the next match day (AI + the user's own game). */
  advance() {
    return this.runner.advanceToNextMatchDay();
  }
  /** What advancing time will hit next (peek, no mutation). */
  peekNextStop() {
    return this.runner.peekNextStop();
  }
  /** Advance one match day of AI fixtures; stops (without playing) on the user's
   *  own fixture or season end. */
  advanceDay() {
    return this.runner.advanceDay();
  }
  /** Quick-sim the rest of the season. */
  simulateSeason(): void {
    this.runner.simulateSeason();
  }
  rolloverSeason(): void {
    this.runner.rolloverSeason();
  }
  /** Run an AI transfer window (deterministic). */
  runTransferWindow(tick: number): CompletedTransfer[] {
    return runTransferWindow(this.state, this.dataById, tick);
  }

  // Watch flow: prepare (sim AI up to the user's game) → UI watches → commit.
  prepareNextUserFixture() {
    return this.runner.prepareNextUserFixture();
  }
  commitUserFixture(comp: CareerCompetition, fixture: import("@fut/competition").DatedFixture, result: import("@fut/engine").MatchResult) {
    return this.runner.commitUserFixture(comp, fixture, result);
  }
  buildTeams(fixture: import("@fut/competition").DatedFixture): { home: Team; away: Team } {
    return this.runner.buildTeams(fixture);
  }
}
