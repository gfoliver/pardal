import type { LeagueData, PlayerData, StandingRow } from "@fut/competition";
import type { Team } from "@fut/domain";
import { apply } from "../command/apply.js";
import type { CareerCommand } from "../command/CareerCommand.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import type { Contract } from "../contract/Contract.js";
import { OfferStatus } from "../transfer/types.js";
import { agreeTerms, expectedWage, playerValue, respondToOffer, userMakeOffer } from "../transfer/TransferMarket.js";
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

/** Everything the shared player-detail view needs (own or another club's). */
export interface PlayerDetailView {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly nationality: string;
  readonly overall: number;
  readonly clubId: string;
  readonly clubName: string;
  readonly isMine: boolean;
  /** FIFA-style summary (pace/shooting/passing/defending/physical), 1-99. */
  readonly attrs: { pace: number; shooting: number; passing: number; defending: number; physical: number };
  readonly currentAbility: number;
  readonly potentialAbility: number;
  /** 1-5 stars; only meaningful when `known` (own player or scouted). */
  readonly potentialStars: number;
  readonly known: boolean;
  readonly injured: boolean;
  readonly available: boolean;
  readonly value: number;
  readonly contract?: Contract;
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
    if (state.targetPlayerIds == null) (state as { targetPlayerIds: string[] }).targetPlayerIds = [];
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

  /** Which club currently holds a player (empty string if none). */
  private clubOf(id: string): string {
    return Object.keys(this.state.clubs).find((c) => this.state.clubs[c]!.squad.playerIds.includes(id)) ?? "";
  }
  /** Unified detail for the shared player view (own squad or the market). */
  playerDetail(id: string): PlayerDetailView | null {
    const data = this.dataById.get(id);
    if (!data) return null;
    const dev = this.state.playerDev[id];
    const clubId = this.clubOf(id);
    const isMine = clubId === this.state.managedClubId;
    const known = isMine || this.state.scoutedPlayerIds.includes(id);
    const r = (n: number) => Math.round(n);
    return {
      playerId: id,
      name: data.name,
      position: data.position,
      age: dev?.ageAtSeasonStart ?? data.age,
      nationality: data.nationality,
      overall: r(effectiveOverall(data, dev)),
      clubId,
      clubName: this.clubName(clubId),
      isMine,
      attrs: {
        pace: r(data.physical.pace),
        shooting: r((data.technical.finishing * 2 + data.technical.shotPower) / 3),
        passing: r((data.technical.passing + data.technical.technique + data.mental.vision) / 3),
        defending: r((data.technical.tackling + data.technical.marking + data.mental.positioning) / 3),
        physical: r((data.physical.strength + data.physical.stamina + data.physical.agility) / 3),
      },
      currentAbility: dev?.currentAbility ?? 0,
      potentialAbility: dev?.potentialAbility ?? 0,
      potentialStars: dev ? Math.max(1, Math.round(dev.potentialAbility / 40)) : 0,
      known,
      injured: Boolean(dev?.injury),
      available: dev ? isAvailable(dev) : true,
      value: playerValue(this.state, this.dataById, id),
      contract: this.state.contracts[id],
    };
  }

  // --- transfers / scouting ----------------------------------------------
  private targetRow(id: string): TransferTarget | null {
    const data = this.dataById.get(id);
    if (!data) return null;
    const dev = this.state.playerDev[id];
    const clubId = this.clubOf(id);
    const scouted = this.state.scoutedPlayerIds.includes(id);
    return {
      playerId: id,
      name: data.name,
      clubId,
      clubShort: this.state.clubs[clubId]?.shortName ?? "—",
      position: data.position,
      age: dev?.ageAtSeasonStart ?? data.age,
      overall: Math.round(effectiveOverall(data, dev)),
      value: playerValue(this.state, this.dataById, id),
      scouted,
      potentialStars: scouted && dev ? Math.max(1, Math.round(dev.potentialAbility / 40)) : undefined,
    };
  }
  /** Every buyable player at another club (used by the scouting/discovery view). */
  transferTargets(): TransferTarget[] {
    const out: TransferTarget[] = [];
    for (const [clubId, club] of Object.entries(this.state.clubs)) {
      if (clubId === this.state.managedClubId) continue;
      for (const id of club.squad.playerIds) {
        const row = this.targetRow(id);
        if (row) out.push(row);
      }
    }
    return out;
  }
  /** The manager's shortlist. */
  shortlist(): TransferTarget[] {
    return this.state.targetPlayerIds.map((id) => this.targetRow(id)).filter((r): r is TransferTarget => r !== null);
  }
  isTarget(id: string): boolean {
    return this.state.targetPlayerIds.includes(id);
  }
  addTarget(id: string): void {
    if (!this.state.targetPlayerIds.includes(id)) this.state.targetPlayerIds.push(id);
  }
  removeTarget(id: string): void {
    this.state.targetPlayerIds = this.state.targetPlayerIds.filter((t) => t !== id);
  }
  /** Offers the manager has made (outgoing), enriched. */
  myOffers() {
    return this.state.transfers.offers
      .filter((o) => o.fromClubId === this.state.managedClubId)
      .map((o) => ({ ...o, playerName: this.playerName(o.playerId), toClubName: this.clubName(o.toClubId) }));
  }
  /** Offers received for the manager's players (incoming, pending). */
  pendingOffers() {
    return this.state.transfers.offers
      .filter((o) => o.status === OfferStatus.Pending && o.toClubId === this.state.managedClubId)
      .map((o) => ({ ...o, playerName: this.playerName(o.playerId), fromClubName: this.clubName(o.fromClubId) }));
  }
  get transferBudget(): number {
    return this.state.clubs[this.state.managedClubId]?.finance.transferBudget ?? 0;
  }
  /** Lodge an offer for a target; the AI owner decides on the next advance. */
  makeOffer(playerId: string, fee: number): boolean {
    return userMakeOffer(this.state, playerId, fee);
  }
  respondOffer(offerId: string, accept: boolean): void {
    respondToOffer(this.state, this.dataById, offerId, accept);
  }
  /** Fee-agreed signings awaiting the manager's personal terms with the player. */
  pendingSignings() {
    return (this.state.transfers.signings ?? []).map((s) => ({
      ...s,
      playerName: this.playerName(s.playerId),
      fromClubName: this.clubName(s.fromClubId),
      expectedWage: expectedWage(this.state, this.dataById, s.playerId),
    }));
  }
  /** Agree personal terms to finalise a signing (player may hold out for wage). */
  agreeTerms(playerId: string, wage: number, years: number): { signed: boolean } {
    return agreeTerms(this.state, this.dataById, playerId, wage, years);
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
