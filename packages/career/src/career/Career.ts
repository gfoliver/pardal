import type { LeagueData, PlayerData, StandingRow } from "@fut/competition";
import {
  type AssignablePlayer,
  assignToFormation,
  Formation,
  getFormationTemplate,
  Mentality,
  Position,
  type RoleKey,
  type Team,
} from "@fut/domain";
import { apply } from "../command/apply.js";
import {
  autoTactics,
  buildDefaultTactic,
  defaultRoleKey,
  DEFAULT_FAMILIARITY,
  MATCHDAY_BENCH_SIZE,
  type SavedTactic,
  type StoredInstructions,
  type StoredTactics,
} from "../tactics/StoredTactics.js";
import { TACTIC_PRESETS, type TacticPresetKey } from "../tactics/presets.js";
import type { CareerCommand } from "../command/CareerCommand.js";
import { buildPlayer, effectiveOverall, isGkData } from "../build/PlayerFactory.js";
import type { Contract } from "../contract/Contract.js";
import { OfferStatus } from "../transfer/types.js";
import { agreeTerms, expectedWage, playerValue, respondToOffer, userMakeOffer } from "../transfer/TransferMarket.js";
import { isAvailable } from "../development/PlayerDev.js";
import { aggregatePlayerStats } from "../stats/PlayerStats.js";
import { activeTactic, type Club } from "../club/Club.js";
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
  /** The player's own, natural position — NOT where a slot fields them. */
  readonly position: string;
  readonly overall: number;
  readonly age: number;
  readonly nationality: string;
  readonly available: boolean;
  readonly injured: boolean;
  /** Match fitness 0-100 (the bench card's condition bar). */
  readonly fitness: number;
  readonly role?: RoleKey;
}

/** One formation slot in the tactics UI. */
export interface TacticsSlot {
  readonly slot: number;
  /** The position this slot FIELDS its player at (may differ from their own). */
  readonly position: string;
  readonly depth: number;
  readonly width: number;
  readonly role: RoleKey;
  readonly player?: TacticsPlayer;
  /**
   * How well the player suits this slot's position, 0..1 — their rating fielded
   * here over their rating in their own position. 1 when playing their own
   * position; undefined when the slot is empty.
   */
  readonly fit?: number;
}

/** A saved tactic's headline info, for the tactic-tabs strip. */
export interface SavedTacticSummary {
  readonly id: string;
  readonly name: string;
  readonly formation: Formation;
  /** 0-100 — how well the squad has drilled this exact setup. */
  readonly familiarity: number;
}

export type TacticsDiagnosticSeverity = "error" | "warn" | "info";
export type TacticsDiagnosticKind = "starterUnavailable" | "outOfPosition" | "noBenchGk" | "overlappingSlots" | "benchShort";

/** One thing worth flagging about the active tactic (see `Career.tacticsDiagnostics`). */
export interface TacticsDiagnostic {
  readonly severity: TacticsDiagnosticSeverity;
  readonly kind: TacticsDiagnosticKind;
  readonly slot?: number;
  readonly playerId?: string;
  readonly playerName?: string;
}

/** UI-ready view of a club's persisted tactics (the ACTIVE saved tactic). */
export interface TacticsView {
  readonly clubId: string;
  readonly formation: Formation;
  readonly mentality: Mentality;
  readonly instructions: StoredInstructions;
  readonly slots: readonly TacticsSlot[];
  /** The matchday substitutes — exactly who TeamBuilder benches for a fixture, in order. */
  readonly bench: readonly TacticsPlayer[];
  /** The rest of the squad: not starting, not even dressing as a substitute. */
  readonly reserves: readonly TacticsPlayer[];
  /** Every tactic the club has saved, active one included. */
  readonly tactics: readonly SavedTacticSummary[];
  readonly activeTacticId: string;
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

/** Broadcast-style report for a finished fixture. */
export interface MatchSummaryView {
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  /** Every goal in the match, in order, with the scorer's name. */
  readonly scorers: readonly { playerId: string; name: string; teamId: string; assistName?: string }[];
  /** Best rated player on the pitch. */
  readonly motm?: { playerId: string; name: string; teamId: string; rating: number; goals: number };
  /** The rest of the round's fixtures (same competition). */
  readonly otherResults: readonly { homeId: string; awayId: string; homeScore: number; awayScore: number }[];
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
    // Migrate saves that predate multiple named tactics: fold the old single
    // formation/mentality/tactics trio into one saved tactic, "1" (idempotent —
    // a save already on the new shape is untouched).
    const devById = new Map(Object.values(state.playerDev).map((d) => [d.playerId, d]));
    for (const club of Object.values(state.clubs)) {
      const legacy = club as Club & { formation?: Formation; mentality?: Mentality; tactics?: StoredTactics };
      if (!Array.isArray(club.tacticSlots) || club.tacticSlots.length === 0) {
        const mentality = legacy.mentality ?? Mentality.Balanced;
        const base: Omit<SavedTactic, "id" | "name"> = legacy.tactics
          ? { ...legacy.tactics, formation: legacy.formation ?? Formation.F442, mentality, familiarity: DEFAULT_FAMILIARITY }
          : buildDefaultTactic(club.squad.playerIds, mentality, dataById, devById);
        club.tacticSlots = [{ id: "t1", name: "1", ...base }];
        club.activeTacticId = "t1";
        delete legacy.tactics;
        delete legacy.formation;
        delete legacy.mentality;
      }
      if (!club.tacticSlots.some((s) => s.id === club.activeTacticId)) club.activeTacticId = club.tacticSlots[0]!.id;
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
      age: data.age,
      nationality: data.nationality,
      available: dev ? isAvailable(dev) : true,
      injured: Boolean(dev?.injury),
      fitness: dev?.fitness ?? 100,
      role,
    };
  }
  /** Fit of a player at `fielded`, relative to their own position: 1 = natural, < 1 = out of position. */
  private fitAt(id: string, fielded: Position): number | undefined {
    const data = this.dataById.get(id);
    if (!data) return undefined;
    const player = buildPlayer(data, this.state.playerDev[id]);
    const natural = player.overall(data.position as Position);
    if (natural <= 0) return undefined;
    return Math.min(1, player.overall(fielded) / natural);
  }
  /** UI-ready tactics for a club (formation slots + bench + instructions), for its ACTIVE saved tactic. */
  tacticsView(clubId = this.state.managedClubId): TacticsView | null {
    const club = this.state.clubs[clubId];
    if (!club || club.tacticSlots.length === 0) return null;
    const t = activeTactic(club);
    const template = getFormationTemplate(t.formation);
    const roleAt = (id: string | undefined, pos: Position): RoleKey => (id && t.roles[id]) || defaultRoleKey(pos);
    const slots: TacticsSlot[] = template.map((s, i) => {
      const id = t.lineup[i];
      const custom = t.slotPositions?.[i]; // dragged position overrides the template
      const fielded = t.slotFielded?.[i] ?? s.position; // as does a chosen position
      return {
        slot: i,
        position: fielded,
        depth: custom?.depth ?? s.depth,
        width: custom?.width ?? s.width,
        role: roleAt(id, fielded),
        player: id ? this.tacticsPlayer(id, id ? t.roles[id] : undefined) : undefined,
        fit: id ? this.fitAt(id, fielded) : undefined,
      };
    });
    // `t.bench` lists the WHOLE rest of the squad in preference order; only its
    // first MATCHDAY_BENCH_SIZE actually dress for the match (see TeamBuilder) —
    // the rest are reserves. Squad members not yet in either list (e.g. a fresh
    // signing) are topped up at the back, as reserves.
    const restIds = [...t.bench, ...club.squad.playerIds.filter((id) => !t.lineup.includes(id) && !t.bench.includes(id))];
    const rest = restIds.map((id) => this.tacticsPlayer(id, t.roles[id])).filter((p): p is TacticsPlayer => p !== undefined);
    const bench = rest.slice(0, MATCHDAY_BENCH_SIZE);
    const reserves = rest.slice(MATCHDAY_BENCH_SIZE);
    const tactics: SavedTacticSummary[] = club.tacticSlots.map((s) => ({ id: s.id, name: s.name, formation: s.formation, familiarity: s.familiarity }));
    return { clubId, formation: t.formation, mentality: t.mentality, instructions: t.instructions, slots, bench, reserves, tactics, activeTacticId: club.activeTacticId };
  }
  /**
   * Put a player into a specific SUBSTITUTE slot (0-based, within the matchday
   * bench). If they're already a substitute elsewhere, the two swap places; if
   * they're a mere reserve, they take the slot and its previous occupant drops
   * back to being a reserve. Facade-level (not a reducer command) because it
   * needs the effective bench/reserve ordering `tacticsView` already computes.
   */
  setBenchSlot(index: number, playerId: string, clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club || club.tacticSlots.length === 0) return;
    const t = activeTactic(club);
    const v = this.tacticsView(clubId);
    if (!v || index < 0 || index >= v.bench.length) return;
    const current = v.bench[index]!.playerId;
    if (current === playerId) return;
    const pool = [...v.bench.map((p) => p.playerId), ...v.reserves.map((p) => p.playerId)];
    const poolIndex = pool.indexOf(playerId);
    if (poolIndex < 0) return;
    pool[poolIndex] = current;
    pool[index] = playerId;
    this.dispatch({ type: "setTactics", clubId, tactics: { ...t, bench: pool } });
  }

  private static readonly OUT_OF_POSITION_FIT_THRESHOLD = 0.85;
  private static readonly OVERLAP_DISTANCE = 0.07;
  private static readonly BENCH_SHORT_THRESHOLD = 5;

  /**
   * Problems with the active tactic worth flagging to the manager, most severe
   * first: an unavailable starter is an ERROR (the team builder will silently
   * replace them at kick-off); a badly out-of-position starter, no fit
   * goalkeeper on the bench, or two slots dragged on top of each other are
   * WARNings; a thin bench is just an INFO.
   */
  tacticsDiagnostics(clubId = this.state.managedClubId): TacticsDiagnostic[] {
    const v = this.tacticsView(clubId);
    if (!v) return [];
    const out: TacticsDiagnostic[] = [];

    for (const slot of v.slots) {
      const p = slot.player;
      if (!p) continue;
      if (!p.available || p.injured) {
        out.push({ severity: "error", kind: "starterUnavailable", slot: slot.slot, playerId: p.playerId, playerName: p.name });
        continue; // an unavailable starter's fit% isn't the interesting problem
      }
      if (slot.fit !== undefined && slot.fit < Career.OUT_OF_POSITION_FIT_THRESHOLD) {
        out.push({ severity: "warn", kind: "outOfPosition", slot: slot.slot, playerId: p.playerId, playerName: p.name });
      }
    }

    const fitBenchGk = v.bench.some((p) => p.position === Position.Goalkeeper && p.available && !p.injured);
    if (!fitBenchGk) out.push({ severity: "warn", kind: "noBenchGk" });

    for (let i = 0; i < v.slots.length; i++) {
      for (let j = i + 1; j < v.slots.length; j++) {
        const a = v.slots[i]!;
        const b = v.slots[j]!;
        if (Math.hypot(a.depth - b.depth, a.width - b.width) < Career.OVERLAP_DISTANCE) {
          out.push({ severity: "warn", kind: "overlappingSlots", slot: i });
        }
      }
    }

    const availableBench = v.bench.filter((p) => p.available && !p.injured).length;
    if (availableBench < Career.BENCH_SHORT_THRESHOLD) out.push({ severity: "info", kind: "benchShort" });

    return out;
  }
  /**
   * Switch formation, re-fitting the SAME eleven to the new shape (best fit per
   * slot, roles defaulted to the new positions). Personnel are the manager's
   * choice, the arrangement is not — leaving the old slot order in place would
   * field a centre-back wherever the new template happens to want a midfielder.
   * Custom cells and chosen positions belonged to the old shape, so they go.
   */
  setFormation(formation: Formation, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setFormation", clubId, formation });
    const club = this.state.clubs[clubId];
    if (!club || club.tacticSlots.length === 0) return;
    const t = activeTactic(club);
    const assignable = t.lineup
      .map((id) => ({ id, data: this.dataById.get(id), dev: this.devMap().get(id) }))
      .filter((e) => e.data !== undefined)
      .map<AssignablePlayer>((e) => {
        const player = buildPlayer(e.data!, e.dev);
        return {
          id: e.id,
          position: e.data!.position as Position,
          isGoalkeeper: isGkData(e.data!),
          rating: effectiveOverall(e.data!, e.dev),
          ratingAt: (position: Position) => player.overall(position),
        };
      });
    const template = getFormationTemplate(formation);
    const { slots } = assignToFormation(assignable, formation);
    const lineup: string[] = [];
    const roles: Record<string, RoleKey> = {};
    for (const [i, a] of slots.entries()) {
      if (!a) continue;
      lineup.push(a.playerId);
      roles[a.playerId] = defaultRoleKey(template[i]!.position);
    }
    if (lineup.length !== t.lineup.length) return; // nothing sensible to re-fit
    this.dispatch({ type: "setTactics", clubId, tactics: { ...t, lineup, roles, slotPositions: undefined, slotFielded: undefined } });
  }
  setMentality(mentality: Mentality, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setMentality", clubId, mentality });
  }
  setInstruction(patch: Partial<StoredInstructions>, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setInstructions", clubId, patch });
  }
  /**
   * Put a player into an XI slot (swap-aware). The one thing it refuses is
   * leaving the goalkeeper's slot to someone who cannot keep goal — either by
   * moving an outfielder in, or by swapping the keeper out for one. (The team
   * builder would otherwise quietly overrule the manager's XI at kick-off.)
   * Checked here rather than in the reducer because it needs the dataset to know
   * who keeps goal.
   */
  setLineupSlot(slot: number, playerId: string, clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    const t = club && club.tacticSlots.length > 0 ? activeTactic(club) : undefined;
    if (club && t) {
      const gkSlot = getFormationTemplate(t.formation).findIndex((s) => s.position === Position.Goalkeeper);
      if (gkSlot >= 0) {
        if (slot === gkSlot && !this.isKeeper(playerId)) return;
        const displaced = t.lineup[slot];
        if (t.lineup.indexOf(playerId) === gkSlot && displaced && !this.isKeeper(displaced)) return;
      }
    }
    this.dispatch({ type: "setLineupSlot", clubId, slot, playerId });
  }
  private isKeeper(playerId: string): boolean {
    const data = this.dataById.get(playerId);
    return Boolean(data && isGkData(data));
  }
  /** Move a slot's pitch coordinates (0..1 depth/width) — drag on the pitch. */
  setSlotPosition(slot: number, depth: number, width: number, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setSlotPosition", clubId, slot, depth, width });
  }
  /** Field the player in a slot at a different position (their role follows). */
  setSlotFielded(slot: number, position: Position, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setSlotFielded", clubId, slot, position });
  }
  setPlayerRole(playerId: string, roleKey: RoleKey, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "setRole", clubId, playerId, roleKey });
  }
  autoPickLineup(clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club || club.tacticSlots.length === 0) return;
    const t = activeTactic(club);
    const tactics = autoTactics(club.squad.playerIds, t.formation, t.mentality, this.dataById, this.devMap());
    this.dispatch({ type: "setTactics", clubId, tactics });
  }

  /** The next deterministic tactic id for a club: "t" + (1 + the highest numeric suffix in use). */
  private nextTacticId(club: Club): string {
    const max = club.tacticSlots.reduce((m, t) => {
      const n = /^t(\d+)$/.exec(t.id);
      return n ? Math.max(m, Number(n[1])) : m;
    }, 0);
    return `t${max + 1}`;
  }
  /** Create a new saved tactic (a copy of `sourceId` ?? the active one) and select it. */
  createTactic(name?: string, clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club) return;
    const id = this.nextTacticId(club);
    this.dispatch({ type: "createTactic", clubId, id, name: name ?? String(club.tacticSlots.length + 1) });
  }
  duplicateTactic(sourceId: string, name?: string, clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club) return;
    const id = this.nextTacticId(club);
    this.dispatch({ type: "createTactic", clubId, id, name: name ?? String(club.tacticSlots.length + 1), sourceId });
  }
  renameTactic(id: string, name: string, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "renameTactic", clubId, id, name });
  }
  deleteTactic(id: string, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "deleteTactic", clubId, id });
  }
  selectTactic(id: string, clubId = this.state.managedClubId): void {
    this.dispatch({ type: "selectTactic", clubId, id });
  }
  /** Apply a named strategy bundle (mentality + every slider + marking) to the active tactic. */
  applyPreset(key: TacticPresetKey, clubId = this.state.managedClubId): void {
    const preset = TACTIC_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    this.dispatch({ type: "setMentality", clubId, mentality: preset.mentality });
    this.dispatch({ type: "setInstructions", clubId, patch: preset.instructions });
  }

  /** Which club currently holds a player (empty string if none). */
  private clubOf(id: string): string {
    return Object.keys(this.state.clubs).find((c) => this.state.clubs[c]!.squad.playerIds.includes(id)) ?? "";
  }

  private _domestic?: string;

  /**
   * The league's own nationality, i.e. the most common one in the dataset.
   * Derived rather than hardcoded: a dataset writes nationality however its
   * source does ("Brazil", "BR", "Portugal"), so "foreign" only means "not what
   * most of this league is".
   */
  private domesticNationality(): string {
    if (this._domestic !== undefined) return this._domestic;
    const tally = new Map<string, number>();
    for (const d of this.dataById.values()) {
      const nat = d.nationality;
      if (nat) tally.set(nat, (tally.get(nat) ?? 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [nat, n] of tally) if (n > bestN) { best = nat; bestN = n; }
    this._domestic = best;
    return best;
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
    const home = this.domesticNationality();
    const foreigners = squad.filter((e) => (this.dataById.get(e.playerId)?.nationality ?? home) !== home).length;

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
      formation: activeTactic(club).formation,
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

  /**
   * Post-match report for a fixture that has been played: its goals, the
   * best-rated player and the other results from the same round. Reads the
   * stored FixtureResult, so it works for quick-simmed and watched matches
   * alike.
   */
  matchSummary(round: number, homeId: string, awayId: string, competitionId = "league"): MatchSummaryView | null {
    const comp = this.state.competitions.find((c) => c.id === competitionId);
    if (!comp) return null;
    const fr = comp.results.find((r) => r.round === round && r.homeTeamId === homeId && r.awayTeamId === awayId);
    if (!fr) return null;
    const scorers = (fr.goals ?? []).map((g) => ({
      playerId: g.scorerId,
      name: this.playerName(g.scorerId),
      teamId: g.teamId,
      assistName: g.assistId ? this.playerName(g.assistId) : undefined,
    }));
    let motm: MatchSummaryView["motm"];
    for (const line of fr.players ?? []) {
      if (!motm || line.rating > motm.rating) {
        motm = {
          playerId: line.playerId,
          name: this.playerName(line.playerId),
          teamId: line.teamId,
          rating: line.rating,
          goals: (fr.goals ?? []).filter((g) => g.scorerId === line.playerId).length,
        };
      }
    }
    const otherResults = comp.results
      .filter((r) => r.round === round && !(r.homeTeamId === homeId && r.awayTeamId === awayId))
      .map((r) => ({ homeId: r.homeTeamId, awayId: r.awayTeamId, homeScore: r.homeScore, awayScore: r.awayScore }));
    return { round, homeId, awayId, homeScore: fr.homeScore, awayScore: fr.awayScore, scorers, motm, otherResults };
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
