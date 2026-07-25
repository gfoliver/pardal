import type { LeagueData, PlayerData, StandingRow } from "@fut/competition";
import { type Formation, getFormationTemplate, type Mentality, type Position, type RoleKey, type Team } from "@fut/domain";
import { apply } from "../command/apply.js";
import { defaultRoleKey, type StoredInstructions } from "../tactics/StoredTactics.js";
import type { CareerCommand } from "../command/CareerCommand.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import type { Contract } from "../contract/Contract.js";
import { OfferStatus } from "../transfer/types.js";
import { agreeTerms, expectedWage, playerValue, respondToOffer, userMakeOffer } from "../transfer/TransferMarket.js";
import { isAvailable } from "../development/PlayerDev.js";
import { aggregatePlayerStats } from "../stats/PlayerStats.js";
import { autoTactics, ensureTactics } from "../tactics/StoredTactics.js";
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
  /** Six summary categories (0-99), FootSim-style. */
  readonly attrs: SixAttrs;
  /** Potential ceiling per category (>= attrs), for the range bars. */
  readonly attrsPotential: SixAttrs;
  readonly currentAbility: number;
  readonly potentialAbility: number;
  /** 1-5 stars; only meaningful when `known` (own player or scouted). */
  readonly potentialStars: number;
  /** 1-5 reputation stars, derived from overall. */
  readonly reputationStars: number;
  readonly known: boolean;
  readonly injured: boolean;
  readonly available: boolean;
  readonly value: number;
  readonly contract?: Contract;
}

/** A player as shown in the tactics UI (a filled slot or a bench entry). */
export interface TacticsPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly overall: number;
  readonly available: boolean;
  readonly injured: boolean;
  readonly role?: RoleKey;
}

/** One formation slot in the tactics UI. */
export interface TacticsSlot {
  readonly slot: number;
  readonly position: string;
  readonly depth: number;
  readonly width: number;
  readonly role: RoleKey;
  readonly player?: TacticsPlayer;
}

/** UI-ready view of a club's persisted tactics. */
export interface TacticsView {
  readonly clubId: string;
  readonly formation: Formation;
  readonly mentality: Mentality;
  readonly instructions: StoredInstructions;
  readonly slots: readonly TacticsSlot[];
  readonly bench: readonly TacticsPlayer[];
}

/** Finalização/Técnica/Passe/Desarme/Físico/Velocidade — 0-99. */
export interface SixAttrs {
  readonly fin: number;
  readonly tec: number;
  readonly pas: number;
  readonly des: number;
  readonly fis: number;
  readonly vel: number;
}

/** Season stats + recent games for the player detail view. */
export interface PlayerStatsView {
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly minutes: number;
  readonly avgRating: number;
  readonly byCompetition: readonly { competitionId: string; name: string; appearances: number; goals: number; assists: number; avgRating: number }[];
  readonly lastGames: readonly {
    date: { year: number; month: number; day: number } | null;
    competitionName: string;
    opponentShort: string;
    home: boolean;
    goalsFor: number;
    goalsAgainst: number;
    rating: number;
    goals: number;
    assists: number;
  }[];
}

/** A highlighted squad member (best/potential/scorer/assister). */
export interface ClubHighlight {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  /** The headline number for this highlight (overall, stars, goals or assists). */
  readonly figure: number;
}

/** Everything the club profile view needs. */
export interface ClubDetailView {
  readonly clubId: string;
  readonly name: string;
  readonly nickname: string;
  readonly shortName: string;
  readonly leagueName: string;
  readonly isMine: boolean;
  readonly reputation: number;
  readonly reputationStars: number;
  readonly country?: string;
  readonly city?: string;
  readonly stadium?: string;
  readonly capacity?: number;
  readonly founded?: number;
  readonly crest?: string;
  readonly balance: number;
  readonly level: number;
  readonly avgAge: number;
  readonly formation: string;
  readonly coach: { readonly name: string; readonly age: number; readonly nationality: string; readonly stars: number };
  readonly squadCount: number;
  readonly totalValue: number;
  readonly avgValue: number;
  readonly wageBill: number;
  readonly avgWage: number;
  readonly foreigners: number;
  readonly u21: number;
  readonly injured: number;
  readonly form: readonly ("W" | "D" | "L")[];
  readonly record: { readonly won: number; readonly drawn: number; readonly lost: number };
  readonly best?: ClubHighlight;
  readonly potential?: ClubHighlight;
  readonly scorer?: ClubHighlight;
  readonly assister?: ClubHighlight;
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
    // Migrate saves that predate persisted tactics: auto-pick each club's XI.
    const devById = new Map(Object.values(state.playerDev).map((d) => [d.playerId, d]));
    for (const club of Object.values(state.clubs)) {
      if (!club.tactics) club.tactics = ensureTactics(club, dataById, devById);
    }
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
  /** Common display name ("Vasco"), falling back to the legal name. */
  clubNickname(id: string): string {
    const c = this.state.clubs[id];
    return c?.nickname ?? c?.name ?? id;
  }
  /** Club crest data URI, if the dataset supplied one. */
  clubCrest(id: string): string | undefined {
    return this.state.clubs[id]?.crest;
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

  // --- tactics ------------------------------------------------------------
  private devMap(): Map<string, import("../development/PlayerDev.js").PlayerDev> {
    return new Map(Object.values(this.state.playerDev).map((d) => [d.playerId, d]));
  }
  private tacticsPlayer(id: string, role?: RoleKey): TacticsPlayer | undefined {
    const data = this.dataById.get(id);
    if (!data) return undefined;
    const dev = this.state.playerDev[id];
    return {
      playerId: id,
      name: data.name,
      position: data.position,
      overall: Math.round(effectiveOverall(data, dev)),
      available: dev ? isAvailable(dev) : true,
      injured: Boolean(dev?.injury),
      role,
    };
  }
  /** UI-ready tactics for a club (formation slots + bench + instructions). */
  tacticsView(clubId = this.state.managedClubId): TacticsView | null {
    const club = this.state.clubs[clubId];
    if (!club || !club.tactics) return null;
    const t = club.tactics;
    const template = getFormationTemplate(club.formation);
    const roleAt = (id: string | undefined, pos: Position): RoleKey => (id && t.roles[id]) || defaultRoleKey(pos);
    const slots: TacticsSlot[] = template.map((s, i) => {
      const id = t.lineup[i];
      const custom = t.slotPositions?.[i]; // dragged position overrides the template
      return {
        slot: i,
        position: s.position,
        depth: custom?.depth ?? s.depth,
        width: custom?.width ?? s.width,
        role: roleAt(id, s.position),
        player: id ? this.tacticsPlayer(id, id ? t.roles[id] : undefined) : undefined,
      };
    });
    const benchIds = [...t.bench, ...club.squad.playerIds.filter((id) => !t.lineup.includes(id) && !t.bench.includes(id))];
    const bench = benchIds.map((id) => this.tacticsPlayer(id, t.roles[id])).filter((p): p is TacticsPlayer => p !== undefined);
    return { clubId, formation: club.formation, mentality: club.mentality, instructions: t.instructions, slots, bench };
  }
  setFormation(formation: Formation, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setFormation", clubId, formation });
  }
  setMentality(mentality: Mentality, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setMentality", clubId, mentality });
  }
  setInstruction(patch: Partial<StoredInstructions>, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setInstructions", clubId, patch });
  }
  setLineupSlot(slot: number, playerId: string, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setLineupSlot", clubId, slot, playerId });
  }
  /** Move a slot's pitch coordinates (0..1 depth/width) — drag on the pitch. */
  setSlotPosition(slot: number, depth: number, width: number, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setSlotPosition", clubId, slot, depth, width });
  }
  setPlayerRole(playerId: string, roleKey: RoleKey, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setRole", clubId, playerId, roleKey });
  }
  autoPickLineup(clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club) return;
    const tactics = autoTactics(club.squad.playerIds, club.formation, club.mentality, this.dataById, this.devMap());
    this.dispatch({ type: "setTactics", clubId, tactics });
  }

  /** Which club currently holds a player (empty string if none). */
  private clubOf(id: string): string {
    return Object.keys(this.state.clubs).find((c) => this.state.clubs[c]!.squad.playerIds.includes(id)) ?? "";
  }

  /** Aggregated profile for a club (own or rival). */
  clubDetail(clubId: string): ClubDetailView | null {
    const club = this.state.clubs[clubId];
    if (!club) return null;
    const squad = this.squad(clubId);
    const n = Math.max(1, squad.length);
    const sum = (f: (e: SquadEntry) => number) => squad.reduce((s, e) => s + f(e), 0);
    const values = new Map(squad.map((e) => [e.playerId, playerValue(this.state, this.dataById, e.playerId)]));
    const totalValue = [...values.values()].reduce((s, v) => s + v, 0);
    const wageBill = sum((e) => e.contract?.wage ?? 0);
    const foreigners = squad.filter((e) => (this.dataById.get(e.playerId)?.nationality ?? "BR") !== "BR").length;

    // Goals/assists tallied across every stored result for this club's players.
    const ids = new Set(squad.map((e) => e.playerId));
    const goalsBy: Record<string, number> = {};
    const assistsBy: Record<string, number> = {};
    for (const comp of this.state.competitions)
      for (const fr of comp.results)
        for (const g of fr.goals ?? []) {
          if (ids.has(g.scorerId)) goalsBy[g.scorerId] = (goalsBy[g.scorerId] ?? 0) + 1;
          if (g.assistId && ids.has(g.assistId)) assistsBy[g.assistId] = (assistsBy[g.assistId] ?? 0) + 1;
        }
    const topBy = (tally: Record<string, number>): ClubHighlight | undefined => {
      let bestId: string | undefined;
      for (const [id, v] of Object.entries(tally)) if (v > 0 && (bestId === undefined || v > tally[bestId]!)) bestId = id;
      const e = bestId ? squad.find((s) => s.playerId === bestId) : undefined;
      return e ? { playerId: e.playerId, name: e.name, position: e.position, figure: tally[bestId!]! } : undefined;
    };
    const highlight = (e: SquadEntry | undefined, figure: number): ClubHighlight | undefined =>
      e ? { playerId: e.playerId, name: e.name, position: e.position, figure } : undefined;
    const best = [...squad].sort((a, b) => b.overall - a.overall)[0];
    const pot = [...squad].sort((a, b) => b.potentialAbility - a.potentialAbility)[0];

    // Form (last 5) + record from the league standings.
    const leagueComp = this.state.competitions.find((c) => c.id === "league");
    const form: ("W" | "D" | "L")[] = [];
    for (const fr of leagueComp?.results ?? []) {
      if (fr.homeTeamId !== clubId && fr.awayTeamId !== clubId) continue;
      const home = fr.homeTeamId === clubId;
      const gf = home ? fr.homeScore : fr.awayScore;
      const ga = home ? fr.awayScore : fr.homeScore;
      form.push(gf > ga ? "W" : gf < ga ? "L" : "D");
    }
    const row = this.runner.table("league").find((r) => r.teamId === clubId);
    const div = this.state.structure.divisions.find((d) => d.id === club.divisionId);
    const c = club.squad.coach;
    const coachStars = Math.max(1, Math.min(5, Math.round((c.attributes.adaptability + c.attributes.tacticalKnowledge + c.attributes.reactiveness + c.attributes.composure) / 4 / 20)));

    return {
      clubId,
      name: club.name,
      nickname: club.nickname ?? club.name,
      shortName: club.shortName,
      leagueName: div?.name ?? "—",
      isMine: clubId === this.state.managedClubId,
      reputation: club.reputation,
      reputationStars: Math.max(1, Math.min(5, Math.round(club.reputation / 20))),
      country: club.country,
      city: club.city,
      stadium: club.stadium,
      capacity: club.capacity,
      founded: club.founded,
      crest: club.crest,
      balance: club.finance.balance,
      level: Math.round(sum((e) => e.overall) / n),
      avgAge: Math.round(sum((e) => e.age) / n),
      formation: club.formation,
      coach: { name: c.name, age: c.age, nationality: c.nationality, stars: coachStars },
      squadCount: squad.length,
      totalValue,
      avgValue: Math.round(totalValue / n),
      wageBill,
      avgWage: Math.round(wageBill / n),
      foreigners,
      u21: squad.filter((e) => e.age < 21).length,
      injured: squad.filter((e) => e.injured).length,
      form: form.slice(-5),
      record: { won: row?.won ?? 0, drawn: row?.drawn ?? 0, lost: row?.lost ?? 0 },
      best: highlight(best, best?.overall ?? 0),
      potential: highlight(pot, pot ? Math.max(1, Math.round(pot.potentialAbility / 40)) : 0),
      scorer: topBy(goalsBy),
      assister: topBy(assistsBy),
    };
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
    const attrs: SixAttrs = {
      fin: r((data.technical.finishing * 2 + data.technical.shotPower) / 3),
      tec: r((data.technical.technique * 2 + data.technical.dribbling) / 3),
      pas: r((data.technical.passing * 2 + data.mental.vision + data.technical.crossing) / 4),
      des: r((data.technical.tackling + data.technical.marking + data.mental.positioning + data.mental.anticipation) / 4),
      fis: r((data.physical.strength + data.physical.stamina + data.mental.aggression) / 3),
      vel: r((data.physical.pace * 2 + data.physical.agility) / 3),
    };
    // Potential ceiling per category scales the current value by PA/CA headroom.
    const ca = dev?.currentAbility ?? 0;
    const pa = dev?.potentialAbility ?? 0;
    const lift = ca > 0 ? Math.max(1, pa / ca) : 1;
    const ceil = (v: number) => Math.min(99, Math.round(v * lift));
    const attrsPotential: SixAttrs = { fin: ceil(attrs.fin), tec: ceil(attrs.tec), pas: ceil(attrs.pas), des: ceil(attrs.des), fis: ceil(attrs.fis), vel: ceil(attrs.vel) };
    const overall = r(effectiveOverall(data, dev));
    return {
      playerId: id,
      name: data.name,
      position: data.position,
      age: dev?.ageAtSeasonStart ?? data.age,
      nationality: data.nationality,
      overall,
      clubId,
      clubName: this.clubName(clubId),
      isMine,
      attrs,
      attrsPotential,
      currentAbility: ca,
      potentialAbility: pa,
      potentialStars: dev ? Math.max(1, Math.round(pa / 40)) : 0,
      reputationStars: Math.max(1, Math.min(5, Math.round(overall / 20))),
      known,
      injured: Boolean(dev?.injury),
      available: dev ? isAvailable(dev) : true,
      value: playerValue(this.state, this.dataById, id),
      contract: this.state.contracts[id],
    };
  }

  /** Aggregated season stats + recent games for the player detail view. */
  playerStats(id: string, lastN = 5): PlayerStatsView {
    const agg = aggregatePlayerStats(this.state.competitions, id);
    const compName = (compId: string) => {
      const comp = this.state.competitions.find((c) => c.id === compId);
      const div = comp?.divisionId ? this.state.structure.divisions.find((d) => d.id === comp.divisionId) : undefined;
      return div?.name ?? compId;
    };
    // Resolve each recent game's real date by matching its fixture (round + teams).
    const dateOf = (compId: string, round: number, homeId: string, awayId: string) => {
      const comp = this.state.competitions.find((c) => c.id === compId);
      const fx = comp?.fixtures.find((f) => f.round === round && f.homeTeamId === homeId && f.awayTeamId === awayId);
      return fx ? this.civilDate({ season: this.state.currentDate.season, dayOfSeason: fx.day }) : null;
    };
    return {
      appearances: agg.appearances,
      goals: agg.goals,
      assists: agg.assists,
      minutes: agg.minutes,
      avgRating: agg.appearances > 0 ? Math.round((agg.ratingSum / agg.appearances) * 10) / 10 : 0,
      byCompetition: agg.byCompetition.map((c) => ({
        competitionId: c.competitionId,
        name: compName(c.competitionId),
        appearances: c.appearances,
        goals: c.goals,
        assists: c.assists,
        avgRating: c.appearances > 0 ? Math.round((c.ratingSum / c.appearances) * 10) / 10 : 0,
      })),
      lastGames: agg.games
        .slice(-lastN)
        .reverse()
        .map((g) => ({
          date: dateOf(g.competitionId, g.round, g.home ? g.teamId : g.opponentId, g.home ? g.opponentId : g.teamId),
          competitionName: compName(g.competitionId),
          opponentShort: this.clubShort(g.opponentId),
          home: g.home,
          goalsFor: g.goalsFor,
          goalsAgainst: g.goalsAgainst,
          rating: g.rating,
          goals: g.goals,
          assists: g.assists,
        })),
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
