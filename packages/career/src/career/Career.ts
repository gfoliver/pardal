import type { LeagueData, PlayerData, StandingRow } from "@fut/competition";
import {
  type AssignablePlayer,
  type AttrName,
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
  defaultRoleKey,
  MATCHDAY_BENCH_SIZE,
  type SavedTactic,
  type StoredInstructions,
  type StoredTactics,
} from "../tactics/StoredTactics.js";
import { TACTIC_PRESETS, type TacticPresetKey } from "../tactics/presets.js";
import type { CareerCommand } from "../command/CareerCommand.js";
import { buildPlayer, effectiveOverall, isGkData } from "../build/PlayerFactory.js";
import type { Contract } from "../contract/Contract.js";
import { contractDemands, offerContract, type ContractDemands, type ContractOutcome } from "../contract/ContractNegotiation.js";
import { daysUntilExpiry, expiringSoon } from "../contract/expiry.js";
import { isOpen, lastFrom, type Negotiation, type NegotiationStage, type RejectionReason } from "../transfer/Negotiation.js";
import { committedToOpenBids, refuseOffer, type OfferRefusal } from "../transfer/NegotiationEngine.js";
import { agreeTerms, expectedWage, playerValue, suggestedAsk } from "../transfer/TransferMarket.js";
import {
  bidForFreeAgent,
  freeAgentDemands,
  freeAgentPool,
  withdrawFreeAgentBid,
  type BidRefusal,
} from "../transfer/FreeAgents.js";
import { activeListings, isListed, listingFor, listingsBy } from "../transfer/TransferList.js";
import { isAvailable } from "../development/PlayerDev.js";
import { aggregatePlayerStats } from "../stats/PlayerStats.js";
import { activeTactic, type Club } from "../club/Club.js";
import { type FinanceSummary, monthlyWageBill, summariseFinance } from "../club/Finance.js";
import { InboxMessageType, type InboxMessage } from "../inbox/types.js";
import { runTransferWindow, type CompletedTransfer } from "../transfer/TransferMarket.js";
import type { CareerCompetition, CareerSnapshot, CareerState, PlayerSeason } from "../state/CareerState.js";
import { civilOf } from "../calendar/dates.js";
import { capacityFor, confidenceOf, refuseAssignment, type AssignRefusal } from "../scouting/ScoutingEngine.js";
import { MAX_RIVAL_CONFIDENCE, attributeKnowledge, estimateMoney, overallGrade, potentialStars, tierFor, type AttrKnowledge, type Estimate } from "../scouting/knowledge.js";
import { resolveSquadNumbers } from "../squad/shirtNumbers.js";
import { scoutSeed } from "../rng/seeds.js";
import { absoluteDay } from "../time/tickDay.js";
import { nextId } from "../state/ids.js";
import { CareerRunner } from "./CareerRunner.js";
import { migrateState } from "./migrate.js";
import { createCareer, indexPlayers, type NewCareerOptions } from "./createCareer.js";

/**
 * A transfer-market row, as the manager understands it.
 *
 * Name, club, position and age are public record. Everything that takes
 * judgement to assess is an estimate — and absent entirely until a scout has
 * filed something. A row with `confidence: 0` carries no numbers at all, which
 * is the point.
 */
export interface TransferTarget {
  readonly playerId: string;
  readonly name: string;
  /** Public record, like the name — a face is not something a scout uncovers. */
  readonly photo?: string;
  readonly clubId: string;
  readonly clubShort: string;
  readonly position: string;
  /** The other positions he is natural in. Public record, like his own. */
  readonly secondaryPositions: readonly string[];
  readonly age: number;
  readonly nationality: string;
  /** 0-100. 100 only for our own players. */
  readonly confidence: number;
  /** Exact rating — only once we know him well enough (60+). */
  readonly overall?: number;
  /** A letter instead, at the first tier of knowledge. */
  readonly overallGrade?: string;
  /** What our scout thinks he'd cost. */
  readonly value?: Estimate;
  /** Ceiling in stars, as a band. */
  readonly potential?: Estimate;
  /**
   * Days until his contract ends; negative once lapsed, undefined if he has none.
   *
   * Unfogged, because when a deal runs out is public record — it is published, argued about in the
   * press and the reason half of all transfers happen. A scout uncovers how GOOD a player is, not
   * what everyone already knows, and hiding this would remove the most ordinary piece of squad
   * planning there is: who can be had cheaply next summer.
   */
  readonly contractDaysLeft?: number;
  /**
   * What he would want to earn, per pay period. Fogged with the rest: it is derived from his value,
   * so publishing it exactly would hand out an unscouted read on his ability.
   */
  readonly wageDemand?: Estimate;
  /** What his club is asking, when they have put him up for sale. A listing is public. */
  readonly askingPrice?: number;
}

/** Everything the shared player-detail view needs (own or another club's). */
export interface PlayerDetailView {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly nationality: string;
  /** Remote portrait URL from the dataset; absent for most players. */
  readonly photo?: string;
  /** 0-100 — how well we know him. 100 only for our own players. */
  readonly confidence: number;
  /** Exact rating, once we know him well enough (60+). */
  readonly overall?: number;
  /** A letter instead, at the first tier of knowledge. */
  readonly overallGrade?: string;
  readonly clubId: string;
  readonly clubName: string;
  readonly isMine: boolean;
  /**
   * Six summary categories (0-99) for the radar — built from our ESTIMATE of
   * each attribute, so the shape is the scout's read, not the truth.
   */
  readonly attrs: SixAttrs;
  /** Potential ceiling per category (>= attrs), for the range bars. */
  readonly attrsPotential: SixAttrs;
  /** Raw ability, only when `known`. */
  readonly currentAbility?: number;
  readonly potentialAbility?: number;
  /** Ceiling in stars, as a band. */
  readonly potential?: Estimate;
  /** 1-5 reputation stars, derived from overall. */
  readonly reputationStars: number;
  /** True once the exact numbers are ours to see. */
  readonly known: boolean;
  readonly injured: boolean;
  readonly available: boolean;
  /**
   * Match fitness 0-100, for OUR players only.
   *
   * Absent for a rival, and that is the point: how sharp another club's player is on a given day is
   * not public record, so it follows the same rule as his rating. The profile screen used to print a
   * hardcoded `?` here for everybody — including our own players, whose exact fitness the squad
   * screen shows one click away.
   */
  readonly fitness?: number;
  /** What we think he's worth. */
  readonly value?: Estimate;
  /** Only our own players' terms are ours to read. */
  readonly contract?: Contract;
}

/** A player as shown in the tactics UI (a filled slot or a bench entry). */
export interface TacticsPlayer {
  readonly playerId: string;
  readonly name: string;
  /** Squad number, absent when nobody has given him one. */
  readonly shirtNumber?: number;
  /** The player's own, natural position — NOT where a slot fields them. */
  readonly position: string;
  /**
   * The OTHER positions he is natural in, his own excluded. Playing him in one of
   * these costs him nothing (see `Player.familiarity`), which is exactly what a
   * manager needs to know before moving him — so it belongs beside the position,
   * not buried in a profile screen. Empty for most players: the squad data only
   * carries a second position where the source actually states one.
   */
  readonly secondaryPositions: readonly string[];
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

/**
 * A transfer conversation, shaped for the UI.
 *
 * Carries the whole transcript rather than a single status, so the screen can
 * show what was asked and offered — and `daysLeft`, because a deal the manager
 * is sitting on is a deal that is running out.
 */
export interface NegotiationView {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  /** Enough to recognise him without leaving the screen — and fogged the same. */
  readonly photo?: string;
  readonly position: string;
  readonly age: number;
  readonly overall?: number;
  readonly overallGrade?: string;
  /** Whoever is on the other side of the table. */
  readonly otherClubName: string;
  readonly weAreBuying: boolean;
  readonly stage: NegotiationStage;
  /** Set when they said no — the UI turns it into a sentence. */
  readonly reason?: RejectionReason;
  readonly rounds: readonly { readonly by: "buyer" | "seller"; readonly fee: number }[];
  readonly ourLastFee?: number;
  readonly theirLastFee?: number;
  readonly agreedFee?: number;
  /** Days before it lapses; undefined once it's closed. */
  readonly daysLeft?: number;
}

/** A contract running down, for the renewals list. */
export interface ExpiringContract {
  readonly playerId: string;
  readonly playerName: string;
  /** Negative once it has already lapsed. */
  readonly daysLeft: number;
  readonly wage: number;
  /** What he'd want to stay. */
  readonly demands?: ContractDemands;
}

/** One player currently under observation, for the scouting desk. */
export interface WatchedPlayer {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  /** Days until the report lands. */
  readonly daysLeft: number;
  readonly confidence: number;
  /** What confidence this report will reach. */
  readonly nextConfidence: number;
}

/** The scouting desk: budget of attention, what it is spent on, and what is waiting. */
export interface ScoutingView {
  readonly capacity: number;
  readonly used: number;
  readonly watching: readonly WatchedPlayer[];
  /** Asked for while every scout was out, in the order they will be picked up. */
  readonly queued: readonly QueuedObservation[];
}

export interface QueuedObservation {
  readonly playerId: string;
  readonly playerName: string;
  /** 1-based place in the line, so the UI never has to count. */
  readonly position: number;
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
  /** Every goal in the match, in order, with the scorer's name and the minute. */
  readonly scorers: readonly { playerId: string; name: string; teamId: string; assistName?: string; minute?: number; penalty?: boolean }[];
  /** Best rated player on the pitch. */
  readonly motm?: { playerId: string; name: string; teamId: string; rating: number; goals: number };
  /** The rest of the round's fixtures (same competition). */
  readonly otherResults: readonly { homeId: string; awayId: string; homeScore: number; awayScore: number }[];
}

/** One fixture inside a round, played or not. */
export interface RoundMatchView {
  readonly homeId: string;
  readonly awayId: string;
  /** Absent until the fixture has been played. */
  readonly homeScore?: number;
  readonly awayScore?: number;
  readonly played: boolean;
  /** True when the managed club is one of the two sides. */
  readonly mine: boolean;
}

/** A competition round: its matchday and every fixture on it. */
export interface RoundView {
  readonly competitionId: string;
  readonly round: number;
  /** Day of the season the round is scheduled on (its earliest fixture). */
  readonly day: number;
  readonly matches: readonly RoundMatchView[];
  /** Every fixture in the round has a result. */
  readonly complete: boolean;
}

/** A highlighted squad member (best/potential/scorer/assister). */
export interface ClubHighlight {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  /** The headline number for this highlight (overall, stars, goals or assists). */
  readonly figure: number;
}

/**
 * Everything the club profile view needs.
 *
 * The optional fields are the FOGGED ones, and the line between them and the rest is the same line
 * scouting draws everywhere else: what is published, and what has to be observed.
 *
 * A squad list, ages, nationalities, injuries, a formation, a run of results and a coach are all
 * public record — reported, watched, argued about. Ability is not, and neither is anything derived
 * from it: this game computes a player's market value FROM his ability, so a squad's total value is
 * his rating in another currency. A rival's board allocation is nobody's business either. All of
 * those are absent unless we have actually watched the players concerned.
 *
 * They are absent rather than partial on purpose. An average rating over the three players we happen
 * to know, printed under the label "average level", is a number that means something other than what
 * it says — worse than no number, because it invites a decision. `ratedCount` is there so a screen
 * can say how much of the squad it has seen instead.
 */
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
  /** The board's allocation for the season — fees and the payroll both come out of it. Ours only. */
  readonly annualBudget?: number;
  /** Mean overall of the squad. Absent unless we can rate every player in it. */
  readonly level?: number;
  readonly avgAge: number;
  readonly formation: string;
  readonly coach: { readonly name: string; readonly age: number; readonly nationality: string; readonly stars: number };
  readonly squadCount: number;
  /** How many of the squad we can rate exactly. Equals `squadCount` for our own club. */
  readonly ratedCount: number;
  readonly totalValue?: number;
  readonly avgValue?: number;
  readonly wageBill?: number;
  readonly avgWage?: number;
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
/**
 * A free agent as the market screen shows him.
 *
 * Unfogged: he belongs to nobody, so there is no club to hide him behind and nothing for the scouting
 * model to model. That is deliberately unlike `targetRow`, where a rival's player is only as visible
 * as our observation of him.
 */
export interface FreeAgentRow {
  readonly playerId: string;
  readonly name: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  readonly value: number;
  readonly photo?: string;
  /** What he is asking, and the least he will consider. */
  readonly askingWage: number;
  readonly minimumWage: number;
  readonly wantsYears: number;
  /** Our offer, if we have one in. */
  readonly myBid?: { readonly wage: number; readonly years: number };
  /** How many OTHER clubs are in — a count, not their numbers. */
  readonly rivalBids: number;
  /** Days until he decides; absent when nobody has bid yet. */
  readonly decidesInDays?: number;
}

export interface SquadEntry {
  readonly playerId: string;
  readonly name: string;
  /** Squad number, absent when nobody has given him one. */
  readonly shirtNumber?: number;
  readonly position: string;
  /**
   * The OTHER positions he is natural in, his own excluded — playing him there costs him nothing
   * (see `Player.familiarity`). On the squad row because "who can cover right back" is a squad
   * question, and answering it by opening twenty profiles is not answering it. Empty for most
   * players: the data only carries a second position where the source states one.
   */
  readonly secondaryPositions: readonly string[];
  readonly age: number;
  readonly nationality: string;
  readonly overall: number;
  /**
   * The same six summary categories the profile radar uses, at their true values.
   *
   * Exact rather than estimated, because these are our own players — the fog is about OTHER clubs'
   * squads. Here so the squad list can be filtered and sorted on ability the manager already has
   * (find the quickest full-back, the strongest available centre-half) instead of only on overall.
   */
  readonly attrs: SixAttrs;
  /** Remote portrait URL from the dataset; absent for most players. */
  readonly photo?: string;
  /** Market value — the manager knows his own players exactly. */
  readonly value: number;
  /** Days until the contract ends; negative once lapsed, undefined if none. */
  readonly contractDaysLeft?: number;
  /** Match sharpness 0-100. */
  readonly fitness: number;
  readonly available: boolean;
  readonly injured: boolean;
  readonly currentAbility: number;
  readonly potentialAbility: number;
  readonly contract?: Contract;
  /** Set when he is on the transfer list — the figure we are asking for him. */
  readonly askingPrice?: number;
}

/** One of our players on the transfer list, shaped for the UI. */
export interface ListedPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly photo?: string;
  readonly position: string;
  readonly age: number;
  readonly overall: number;
  /** What he is worth, which the manager knows exactly for his own players. */
  readonly value: number;
  readonly askingPrice: number;
  /** How long he has been available — a listing nobody bites on is information. */
  readonly listedDays: number;
  /** The bid on the table, if a rival has come in for him. */
  readonly bid?: number;
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
    // A save and its dataset have separate lifetimes; reconcile before reading.
    this.state = migrateState(state, dataById);
    this.runner = new CareerRunner(this.state, dataById);
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

  /**
   * A competition's fixture list grouped by round, in matchday order.
   *
   * One shape for both halves of the season: a round the calendar has passed
   * carries scores, a round still to come carries none. The screen decides
   * which to show rather than reading two different structures.
   */
  rounds(competitionId = "league"): RoundView[] {
    const comp = this.state.competitions.find((c) => c.id === competitionId);
    if (!comp) return [];
    const managed = this.state.managedClubId;
    // Results are keyed by round + the pair, which is unique in a round-robin.
    const scores = new Map<string, { hs: number; as: number }>();
    for (const r of comp.results) scores.set(`${r.round}:${r.homeTeamId}:${r.awayTeamId}`, { hs: r.homeScore, as: r.awayScore });

    const byRound = new Map<number, { day: number; matches: RoundMatchView[] }>();
    for (const f of comp.fixtures) {
      const entry = byRound.get(f.round) ?? { day: f.day, matches: [] };
      entry.day = Math.min(entry.day, f.day);
      const s = scores.get(`${f.round}:${f.homeTeamId}:${f.awayTeamId}`);
      entry.matches.push({
        homeId: f.homeTeamId,
        awayId: f.awayTeamId,
        homeScore: s?.hs,
        awayScore: s?.as,
        played: Boolean(s),
        mine: f.homeTeamId === managed || f.awayTeamId === managed,
      });
      byRound.set(f.round, entry);
    }

    return [...byRound.entries()]
      .map(([round, { day, matches }]) => ({
        competitionId,
        round,
        day,
        matches,
        complete: matches.every((m) => m.played),
      }))
      .sort((a, b) => a.day - b.day || a.round - b.round);
  }
  inbox(): readonly InboxMessage[] {
    return this.state.inbox;
  }
  unreadCount(): number {
    return this.state.inbox.reduce((n, m) => n + (m.read ? 0 : 1), 0);
  }
  /** The club's season budget and what is left of it, with everything derived. */
  finances(clubId = this.state.managedClubId): FinanceSummary | null {
    const club = this.state.clubs[clubId];
    return club ? summariseFinance(club.finance, monthlyWageBill(this.state, clubId)) : null;
  }
  nextUserFixture(): { comp: CareerCompetition; fixture: import("@fut/competition").DatedFixture } | null {
    return this.runner.nextUserFixture();
  }
  squad(clubId = this.state.managedClubId): SquadEntry[] {
    const club = this.state.clubs[clubId];
    if (!club) return [];
    const numbers = this.squadNumbers(clubId);
    const listed = new Map(listingsBy(this.state, clubId).map((l) => [l.playerId, l.askingPrice]));
    return club.squad.playerIds
      .map((id) => {
        const data = this.dataById.get(id)!;
        const dev = this.state.playerDev[id];
        return {
          playerId: id,
          name: data.name,
          shirtNumber: numbers.get(id),
          position: data.position,
          secondaryPositions: (data.naturalPositions ?? []).filter((p) => p !== data.position),
          age: dev?.ageAtSeasonStart ?? data.age,
          nationality: data.nationality,
          overall: Math.round(effectiveOverall(data, dev)),
          attrs: Career.sixAttrs(data),
          photo: data.photo,
          value: playerValue(this.state, this.dataById, id),
          contractDaysLeft: this.daysUntilContractEnd(id),
          fitness: dev?.fitness ?? 100,
          available: dev ? isAvailable(dev) : true,
          injured: Boolean(dev?.injury),
          currentAbility: dev?.currentAbility ?? 0,
          potentialAbility: dev?.potentialAbility ?? 0,
          contract: this.state.contracts[id],
          askingPrice: listed.get(id),
        };
      })
      .sort((a, b) => b.overall - a.overall);
  }

  // --- tactics ------------------------------------------------------------
  private devMap(): Map<string, import("../development/PlayerDev.js").PlayerDev> {
    return new Map(Object.values(this.state.playerDev).map((d) => [d.playerId, d]));
  }
  private tacticsPlayer(id: string, role?: RoleKey, numbers?: ReadonlyMap<string, number>): TacticsPlayer | undefined {
    const data = this.dataById.get(id);
    if (!data) return undefined;
    const dev = this.state.playerDev[id];
    return {
      playerId: id,
      name: data.name,
      shirtNumber: numbers?.get(id),
      position: data.position,
      secondaryPositions: (data.naturalPositions ?? []).filter((p) => p !== data.position),
      overall: Math.round(effectiveOverall(data, dev)),
      age: data.age,
      nationality: data.nationality,
      available: dev ? isAvailable(dev) : true,
      injured: Boolean(dev?.injury),
      fitness: dev?.fitness ?? 100,
      role,
    };
  }
  /**
   * Fit of a player at `fielded`, relative to their own position: 1 = natural, < 1 =
   * out of position.
   *
   * Public because the tactics board ranks CANDIDATES by it — offering a replacement
   * without saying what the move costs is offering a guess, and the same number
   * already labels the slot he would take.
   */
  fitAt(id: string, fielded: Position): number | undefined {
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
    const numbers = this.squadNumbers(clubId);
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
        player: id ? this.tacticsPlayer(id, id ? t.roles[id] : undefined, numbers) : undefined,
        fit: id ? this.fitAt(id, fielded) : undefined,
      };
    });
    // `t.bench` lists the WHOLE rest of the squad in preference order; only its
    // first MATCHDAY_BENCH_SIZE actually dress for the match (see TeamBuilder) —
    // the rest are reserves. Squad members not yet in either list (e.g. a fresh
    // signing) are topped up at the back, as reserves.
    const restIds = [...t.bench, ...club.squad.playerIds.filter((id) => !t.lineup.includes(id) && !t.bench.includes(id))];
    const rest = restIds.map((id) => this.tacticsPlayer(id, t.roles[id], numbers)).filter((p): p is TacticsPlayer => p !== undefined);
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

  // --- squad numbers -------------------------------------------------------
  /**
   * Squad numbers for a club: what the dataset registered, with the manager's
   * own changes on top.
   *
   * Two players CAN arrive sharing a number — a 10 we sign from another club
   * meets the 10 we already had — so this resolves in squad order and hands the
   * later arrival nothing rather than inventing a number for him. That reads as
   * "unassigned" in the UI, which is honest and fixable, instead of silently
   * showing two number 10s on the same pitch.
   */
  squadNumbers(clubId = this.state.managedClubId): Map<string, number> {
    return resolveSquadNumbers(this.state, this.dataById, clubId);
  }

  /** The number this player wears, if he has one. */
  shirtNumber(playerId: string, clubId = this.state.managedClubId): number | undefined {
    return this.squadNumbers(clubId).get(playerId);
  }

  /** Squad numbers not currently worn by anyone at the club, 1..99. */
  freeShirtNumbers(clubId = this.state.managedClubId): number[] {
    const taken = new Set(this.squadNumbers(clubId).values());
    return Array.from({ length: 99 }, (_, i) => i + 1).filter((n) => !taken.has(n));
  }

  /**
   * Give one of our players a number. If a squad-mate already wears it the two
   * SWAP — which is what really happens, and it keeps the assignment complete
   * (refusing instead would just make the manager do the swap in two steps and
   * hit the uniqueness guard halfway through).
   */
  setShirtNumber(playerId: string, number: number, clubId = this.state.managedClubId): void {
    const club = this.state.clubs[clubId];
    if (!club || !club.squad.playerIds.includes(playerId)) return;
    if (!Number.isInteger(number) || number < 1 || number > 99) return;
    const current = this.squadNumbers(clubId);
    if (current.get(playerId) === number) return;

    const numbers: Record<string, number> = {};
    for (const [id, n] of current) numbers[id] = n;
    const holder = [...current.entries()].find(([, n]) => n === number)?.[0];
    const mine = current.get(playerId);
    if (holder && mine !== undefined) numbers[holder] = mine;
    else if (holder) delete numbers[holder]; // we had none to give back
    numbers[playerId] = number;
    this.dispatch({ type: "setShirtNumbers", clubId, numbers });
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
  /**
   * A saved tactic in full (not the UI view) — for the in-match board, which
   * applies a stored setup to the eleven already on the pitch.
   */
  savedTactic(id: string, clubId = this.state.managedClubId): SavedTactic | null {
    return this.state.clubs[clubId]?.tacticSlots.find((t) => t.id === id) ?? null;
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
  /**
   * `fog` defaults to ON for anyone but us, which is the safe default: a new caller gets the
   * scouting rules without having to know they exist. The one place that opts out is the new-career
   * club picker, and it is entitled to — you are choosing who to manage, from outside the world,
   * with nothing yet observed and nothing to hide.
   */
  clubDetail(clubId: string, opts: { readonly fog?: boolean } = {}): ClubDetailView | null {
    const club = this.state.clubs[clubId];
    if (!club) return null;
    const squad = this.squad(clubId);
    const n = Math.max(1, squad.length);
    const fog = opts.fog ?? clubId !== this.state.managedClubId;
    const rated = (id: string) => !fog || tierFor(this.confidenceIn(id)).overall === "exact";
    const ratedCount = squad.filter((e) => rated(e.playerId)).length;
    // Aggregates are all-or-nothing: a total over part of a squad reads as a total over the whole one.
    const whole = ratedCount === squad.length;
    const only = <V,>(v: V): V | undefined => (whole ? v : undefined);
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
    // "Their best player" is itself a finding. Chosen from the ones we have actually watched, so an
    // unscouted league names nobody rather than handing over the man to bid for.
    const seen = squad.filter((e) => rated(e.playerId));
    const best = [...seen].sort((a, b) => b.overall - a.overall)[0];
    const pot = [...seen].sort((a, b) => b.potentialAbility - a.potentialAbility)[0];

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
      // A rival's board allocation is not published anywhere.
      annualBudget: fog ? undefined : club.finance.annualBudget,
      level: only(Math.round(sum((e) => e.overall) / n)),
      avgAge: Math.round(sum((e) => e.age) / n),
      formation: activeTactic(club).formation,
      coach: { name: c.name, age: c.age, nationality: c.nationality, stars: coachStars },
      squadCount: squad.length,
      ratedCount,
      totalValue: only(totalValue),
      avgValue: only(Math.round(totalValue / n)),
      wageBill: only(wageBill),
      avgWage: only(Math.round(wageBill / n)),
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
  /**
   * Unified detail for the shared player view (own squad or the market).
   *
   * Fogged exactly like `targetRow`. It has to be: this screen is reachable from
   * scouting and transfers, so leaving it exact here would have made the whole
   * knowledge model cosmetic — a manager could see the true rating of any player
   * in the league simply by clicking his name.
   */
  playerDetail(id: string): PlayerDetailView | null {
    const data = this.dataById.get(id);
    if (!data) return null;
    const dev = this.state.playerDev[id];
    const clubId = this.clubOf(id);
    const isMine = clubId === this.state.managedClubId;
    const confidence = this.confidenceIn(id);
    const tier = tierFor(confidence);
    const seed = this.state.careerSeed;
    /** Ability numbers are ours to see only once we really know him. */
    const known = tier.overall === "exact";

    const r = (n: number) => Math.round(n);
    // Built from what we BELIEVE each attribute is, so the radar shows the scout's read rather than
    // the truth behind it. Our own players have no fog, and `squad()` passes no beliefs at all.
    const est = new Map(this.playerAttributes(id).map((a) => [a.name, a.estimate.mid]));
    const attrs = Career.sixAttrs(data, est);
    // Potential ceiling per category scales the current value by PA/CA headroom.
    const ca = dev?.currentAbility ?? 0;
    const pa = dev?.potentialAbility ?? 0;
    const lift = ca > 0 ? Math.max(1, pa / ca) : 1;
    const ceil = (x: number) => Math.min(99, Math.round(x * lift));
    const attrsPotential: SixAttrs = { fin: ceil(attrs.fin), tec: ceil(attrs.tec), pas: ceil(attrs.pas), des: ceil(attrs.des), fis: ceil(attrs.fis), vel: ceil(attrs.vel) };
    const overall = r(effectiveOverall(data, dev));

    return {
      playerId: id,
      name: data.name,
      position: data.position,
      age: dev?.ageAtSeasonStart ?? data.age,
      nationality: data.nationality,
      photo: data.photo,
      confidence,
      overall: known ? overall : undefined,
      overallGrade: tier.overall === "grade" ? overallGrade(overall) : undefined,
      clubId,
      clubName: this.clubName(clubId),
      isMine,
      attrs,
      attrsPotential,
      // Raw ability is the most spoiler-ish number there is; only for the known.
      currentAbility: known ? ca : undefined,
      potentialAbility: known ? pa : undefined,
      potential: tier.chart === "hidden" || !dev ? undefined : potentialStars(pa, confidence, seed, id),
      reputationStars: Math.max(1, Math.min(5, Math.round(overall / 20))),
      known,
      injured: Boolean(dev?.injury),
      available: dev ? isAvailable(dev) : true,
      // Ours to read, a rival's not — the same rule his rating follows.
      fitness: isMine ? dev?.fitness ?? 100 : undefined,
      value: tier.chart === "hidden" ? undefined : estimateMoney(playerValue(this.state, this.dataById, id), tier.moneyMargin, scoutSeed(seed, id, "value")),
      contract: isMine ? this.state.contracts[id] : undefined,
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
      minute: g.minute,
      penalty: g.penalty,
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

  /**
   * The twenty-four attributes collapsed to the six categories the UI shows.
   *
   * `believed` is the seam, and the reason this is one function: the profile screen passes the
   * scout's ESTIMATE of each attribute so the radar shows his read, while the squad list passes
   * nothing and gets the true values, because a manager knows his own players. Two copies of this
   * formula would let the same player score differently on two screens.
   */
  private static sixAttrs(data: PlayerData, believed?: ReadonlyMap<AttrName, number>): SixAttrs {
    const v = (name: AttrName, exact: number) => believed?.get(name) ?? exact;
    const r = (n: number) => Math.round(n);
    return {
      fin: r((v("finishing", data.technical.finishing) * 2 + v("shotPower", data.technical.shotPower)) / 3),
      tec: r((v("technique", data.technical.technique) * 2 + v("dribbling", data.technical.dribbling)) / 3),
      pas: r((v("passing", data.technical.passing) * 2 + v("vision", data.mental.vision) + v("crossing", data.technical.crossing)) / 4),
      des: r((v("tackling", data.technical.tackling) + v("marking", data.technical.marking) + v("positioning", data.mental.positioning) + v("anticipation", data.mental.anticipation)) / 4),
      fis: r((v("strength", data.physical.strength) + v("stamina", data.physical.stamina) + v("aggression", data.mental.aggression)) / 3),
      vel: r((v("pace", data.physical.pace) * 2 + v("agility", data.physical.agility)) / 3),
    };
  }

  // --- transfers / scouting ----------------------------------------------
  /**
   * A market row as the manager UNDERSTANDS it.
   *
   * This is the fog's front door: overall, value and potential are estimates
   * whose width comes from how much we've watched him, and below the first tier
   * they are absent entirely. The old version handed out the exact rating of
   * every player in the league, which is why scouting meant nothing.
   */
  private targetRow(id: string, listed?: ReadonlyMap<string, number>): TransferTarget | null {
    const data = this.dataById.get(id);
    if (!data) return null;
    const dev = this.state.playerDev[id];
    const clubId = this.clubOf(id);
    const confidence = this.confidenceIn(id);
    const tier = tierFor(confidence);
    const seed = this.state.careerSeed;
    const overall = Math.round(effectiveOverall(data, dev));

    return {
      playerId: id,
      name: data.name,
      photo: data.photo,
      clubId,
      clubShort: this.state.clubs[clubId]?.shortName ?? "—",
      position: data.position,
      secondaryPositions: (data.naturalPositions ?? []).filter((p) => p !== data.position),
      age: dev?.ageAtSeasonStart ?? data.age,
      nationality: data.nationality,
      confidence,
      // Known outright, ballparked as a letter, or not shown at all.
      overall: tier.overall === "exact" ? overall : undefined,
      overallGrade: tier.overall === "grade" ? overallGrade(overall) : undefined,
      value: tier.chart === "hidden" ? undefined : estimateMoney(playerValue(this.state, this.dataById, id), tier.moneyMargin, scoutSeed(seed, id, "value")),
      potential: tier.chart === "hidden" || !dev ? undefined : potentialStars(dev.potentialAbility, confidence, seed, id),
      contractDaysLeft: this.daysUntilContractEnd(id),
      // A separate scout draw from `value`, or the two estimates would be the same guess twice and a
      // wide value band would come with a suspiciously matching wage band.
      wageDemand:
        tier.chart === "hidden"
          ? undefined
          : estimateMoney(expectedWage(this.state, this.dataById, id), tier.moneyMargin, scoutSeed(seed, id, "wage")),
      askingPrice: listed ? listed.get(id) : listingFor(this.state, id)?.askingPrice,
    };
  }
  /** Every buyable player at another club (used by the scouting/discovery view). */
  transferTargets(): TransferTarget[] {
    // Every active listing once, rather than a scan of them per player: this walks the whole league.
    const listed = new Map(activeListings(this.state).map((l) => [l.playerId, l.askingPrice]));
    const out: TransferTarget[] = [];
    for (const [clubId, club] of Object.entries(this.state.clubs)) {
      if (clubId === this.state.managedClubId) continue;
      for (const id of club.squad.playerIds) {
        const row = this.targetRow(id, listed);
        if (row) out.push(row);
      }
    }
    return out;
  }
  /**
   * One club's whole squad, at the fidelity we have earned.
   *
   * The same row the market list uses, so there is ONE set of fog rules rather than a second set on
   * the club page that could drift from it. `squad()` exists too and returns exact numbers for
   * anybody — correct for our own team and for the new-career picker, and a leak anywhere else, which
   * is why a rival's page reads this instead.
   *
   * Works for our own club as well: confidence in our own players is total, so every figure comes
   * back exact and the caller needs no special case.
   */
  clubSquad(clubId: string): TransferTarget[] {
    const club = this.state.clubs[clubId];
    if (!club) return [];
    const listed = new Map(activeListings(this.state).map((l) => [l.playerId, l.askingPrice]));
    return club.squad.playerIds
      .map((id) => this.targetRow(id, listed))
      .filter((r): r is TransferTarget => r !== null);
  }
  /** The manager's shortlist. */
  shortlist(): TransferTarget[] {
    return this.state.targetPlayerIds.map((id) => this.targetRow(id)).filter((r): r is TransferTarget => r !== null);
  }
  isTarget(id: string): boolean {
    return this.state.targetPlayerIds.includes(id);
  }
  addTarget(id: string): void {
    this.dispatch({ type: "addTarget", playerId: id });
  }
  removeTarget(id: string): void {
    this.dispatch({ type: "removeTarget", playerId: id });
  }
  /** One negotiation, shaped for the UI (names resolved, clock in days). */
  private negotiationRow(n: Negotiation): NegotiationView {
    const today = absoluteDay(this.state);
    const weAreBuying = n.buyerClubId === this.state.managedClubId;
    // The same fogged view the market list shows, so a negotiation row can
    // carry the player's face and numbers without leaking more than the
    // scouting model allows.
    const detail = this.playerDetail(n.playerId);
    return {
      id: n.id,
      playerId: n.playerId,
      playerName: this.playerName(n.playerId),
      photo: detail?.photo,
      position: detail?.position ?? "",
      age: detail?.age ?? 0,
      overall: detail?.overall,
      overallGrade: detail?.overallGrade,
      otherClubName: this.clubName(weAreBuying ? n.sellerClubId : n.buyerClubId),
      weAreBuying,
      stage: n.stage,
      reason: n.reason,
      rounds: n.rounds.map((r) => ({ by: r.by, fee: r.fee })),
      ourLastFee: lastFrom(n, weAreBuying ? "buyer" : "seller")?.fee,
      theirLastFee: lastFrom(n, weAreBuying ? "seller" : "buyer")?.fee,
      agreedFee: n.agreedFee,
      daysLeft: isOpen(n) ? Math.max(0, n.expiresDay - today) : undefined,
    };
  }
  /**
   * Bids we have out that are still going somewhere, newest first.
   *
   * Every open stage, `feeAgreed` included — it is a live deal of ours and belongs in the
   * count of what the manager has on the go. Which of them a screen chooses to DRAW is its
   * own business: Transfers leaves fee-agreed deals to the personal-terms card, because
   * drawing the same deal twice made the page read as twice the workload.
   *
   * With `settledOffers` this covers every negotiation we are the buyer in, so nothing can
   * fall between the two.
   */
  myOffers(): NegotiationView[] {
    return this.state.negotiations
      .filter((n) => n.buyerClubId === this.state.managedClubId && isOpen(n))
      .map((n) => this.negotiationRow(n))
      .reverse();
  }

  /**
   * Bids of ours that are over, newest first — rejected, expired, withdrawn, completed.
   *
   * Kept separately rather than mixed in. One list of both had the dead threads
   * outnumbering the live ones within a season, while the tab counted only the live ones,
   * so the number never matched what was on screen.
   */
  settledOffers(): NegotiationView[] {
    return this.state.negotiations
      .filter((n) => n.buyerClubId === this.state.managedClubId && !isOpen(n))
      .map((n) => this.negotiationRow(n))
      .reverse();
  }

  /**
   * How many transfer decisions are actually waiting on the manager.
   *
   * All three kinds, because all three have a clock: a bid for one of our players, a seller
   * countering ours, and a fee agreed that still needs personal terms. The nav badge used to
   * count only the first, so a counter we had ten days to answer — and a signing about to
   * lapse — showed nothing at all.
   */
  get decisionsWaiting(): number {
    const managed = this.state.managedClubId;
    return this.state.negotiations.filter(
      (n) =>
        isOpen(n) &&
        ((n.sellerClubId === managed && n.stage === "offered") ||
          (n.buyerClubId === managed && (n.stage === "countered" || n.stage === "feeAgreed"))),
    ).length;
  }
  /**
   * Live interest in our players: bids awaiting our answer, and the prices we
   * have named and are waiting on. Dropping the latter would make a negotiation
   * vanish from the screen the moment the manager engaged with it.
   */
  pendingOffers(): NegotiationView[] {
    return this.state.negotiations
      .filter((n) => n.sellerClubId === this.state.managedClubId && (n.stage === "offered" || n.stage === "countered"))
      .map((n) => this.negotiationRow(n));
  }
  /**
   * What we can still put on the table for a fee, with bids already out subtracted.
   *
   * Not the raw budget: a bid is a commitment until it is answered, so four open 40M bids
   * against a 40M pot is a manager who has accidentally bought four players.
   */
  get transferBudget(): number {
    return Math.max(0, (this.finances()?.available ?? 0) - committedToOpenBids(this.state));
  }
  /**
   * Bid for a player at another club. The seller answers on a later day.
   *
   * Returns the REASON when it cannot be lodged. "Offer failed" on its own is the least
   * useful thing this screen can say — the manager cannot tell from it whether to bid again,
   * sell somebody first, or stop trying.
   */
  makeOffer(playerId: string, fee: number): { ok: true } | { ok: false; reason: OfferRefusal } {
    const reason = refuseOffer(this.state, playerId, fee);
    if (reason) return { ok: false, reason };
    this.dispatch({ type: "openNegotiation", id: nextId(this.state, "neg"), playerId, fee });
    return { ok: true };
  }

  /** Why we could not bid `fee` for him, or null — for disabling a button with a reason. */
  offerRefusal(playerId: string, fee: number): OfferRefusal | null {
    return refuseOffer(this.state, playerId, fee);
  }
  /** Improve our bid after a counter (or bid again in the same conversation). */
  counterOffer(negotiationId: string, fee: number): void {
    this.dispatch({ type: "counterOffer", negotiationId, fee });
  }
  /** Take the seller's number as it stands. */
  acceptCounter(negotiationId: string): void {
    this.dispatch({ type: "acceptCounter", negotiationId });
  }
  withdrawOffer(negotiationId: string): void {
    this.dispatch({ type: "withdrawOffer", negotiationId });
  }
  /** Answer a bid for one of our players. */
  respondOffer(negotiationId: string, accept: boolean): void {
    this.dispatch({ type: "respondToBid", negotiationId, accept });
  }
  /** Name our price instead of just saying yes or no. */
  askFor(negotiationId: string, fee: number): void {
    this.dispatch({ type: "askFor", negotiationId, fee });
  }

  // --- transfer list -------------------------------------------------------
  /**
   * Put one of our players up for sale at a price, or re-price a listing.
   *
   * Defaults to `suggestedAsk`, so a manager who just wants somebody gone does not have
   * to invent a number. Listing does NOT authorise a sale: it makes rivals ask far more
   * often, and every bid still arrives as a negotiation to answer.
   */
  listPlayer(playerId: string, askingPrice = this.suggestedAsk(playerId), loanOnly?: boolean): void {
    this.dispatch({ type: "listPlayer", playerId, askingPrice, loanOnly });
  }
  unlistPlayer(playerId: string): void {
    this.dispatch({ type: "unlistPlayer", playerId });
  }
  isListed(playerId: string): boolean {
    return isListed(this.state, playerId);
  }
  /** What we are asking for him, if he is listed at all. */
  askingPrice(playerId: string): number | undefined {
    return listingFor(this.state, playerId)?.askingPrice;
  }
  /** An opening price for a listing: what a rival would have had to beat anyway. */
  suggestedAsk(playerId: string): number {
    return suggestedAsk(this.state, this.dataById, playerId);
  }
  /** Our transfer list, dearest first, each row carrying any bid already on the table. */
  transferList(): ListedPlayer[] {
    const today = absoluteDay(this.state);
    const span = this.state.totalDays || 1;
    return listingsBy(this.state, this.state.managedClubId)
      .filter((l) => this.dataById.has(l.playerId))
      .map((l) => {
        const data = this.dataById.get(l.playerId)!;
        const dev = this.state.playerDev[l.playerId];
        const open = this.state.negotiations.find((n) => n.playerId === l.playerId && n.sellerClubId === this.state.managedClubId && isOpen(n));
        return {
          playerId: l.playerId,
          name: data.name,
          photo: data.photo,
          position: data.position,
          age: dev?.ageAtSeasonStart ?? data.age,
          overall: Math.round(effectiveOverall(data, dev)),
          value: playerValue(this.state, this.dataById, l.playerId),
          askingPrice: l.askingPrice,
          listedDays: Math.max(0, today - (l.listedOn.season * span + l.listedOn.dayOfSeason)),
          bid: open ? lastFrom(open, "buyer")?.fee : undefined,
        };
      })
      .sort((a, b) => b.askingPrice - a.askingPrice);
  }
  /**
   * Fee-agreed signings awaiting the manager's personal terms with the player.
   *
   * Derived from the negotiations themselves rather than kept in a second list.
   * That second list was the bug: the negotiation engine set a deal to
   * `feeAgreed` and posted the "agree terms" mail, but only the OLD offer flow
   * ever wrote `transfers.signings` — which is what this screen reads. So the
   * card never appeared, there was no way to finish the deal, and the fee we had
   * just agreed sat there until the clock killed it. One source of truth, and
   * the symptom cannot come back.
   */
  pendingSignings() {
    const today = absoluteDay(this.state);
    return this.state.negotiations
      .filter((n) => n.stage === "feeAgreed" && n.buyerClubId === this.state.managedClubId && n.agreedFee !== undefined)
      .map((n) => ({
        playerId: n.playerId,
        fromClubId: n.sellerClubId,
        toClubId: n.buyerClubId,
        fee: n.agreedFee!,
        playerName: this.playerName(n.playerId),
        fromClubName: this.clubName(n.sellerClubId),
        expectedWage: expectedWage(this.state, this.dataById, n.playerId),
        /** Days left to agree terms before the deal lapses. */
        daysLeft: Math.max(0, n.expiresDay - today),
      }));
  }
  /** Agree personal terms to finalise a signing (player may hold out for wage). */
  agreeTerms(playerId: string, wage: number, years: number): { signed: boolean } {
    return agreeTerms(this.state, this.dataById, playerId, wage, years);
  }
  // --- contracts -----------------------------------------------------------
  /** What this player would ask for to re-sign. */
  contractDemands(playerId: string): ContractDemands | undefined {
    return contractDemands(this.state, this.dataById, playerId);
  }
  /**
   * Put terms to one of our players. He may accept, name his price, or refuse —
   * a rejected offer leaves the existing contract exactly as it was.
   */
  offerContract(playerId: string, wage: number, years: number): ContractOutcome {
    const outcome = offerContract(this.state, this.dataById, playerId, { wage, years });
    if (outcome.kind !== "accepted") return outcome;
    const c = this.state.contracts[playerId];
    if (!c) return { kind: "rejected", reason: "wantsToLeave" };
    this.state.contracts[playerId] = {
      ...c,
      wage,
      // `years` from TODAY, day of season kept — expiring on day 0 of the target season shortened
      // every renewal signed mid-season by however far into it the manager was.
      expiry: { season: this.state.currentDate.season + years, dayOfSeason: this.state.currentDate.dayOfSeason },
      signedOn: { ...this.state.currentDate },
    };
    // Old warnings are moot once the deal is longer.
    for (const key of Object.keys(this.state.contractsWarned ?? {})) {
      if (key.startsWith(`${playerId}:`)) delete this.state.contractsWarned![key];
    }
    this.state.inbox.push({
      id: nextId(this.state, "exp"),
      type: InboxMessageType.ContractRenewed,
      date: { ...this.state.currentDate },
      read: false,
      params: { playerId },
    });
    return outcome;
  }
  /** Our contracts running down, soonest first — the renewals screen. */
  expiringContracts(days = 180): ExpiringContract[] {
    return expiringSoon(this.state, days).map((r) => ({
      ...r,
      playerName: this.playerName(r.playerId),
      wage: this.state.contracts[r.playerId]?.wage ?? 0,
      demands: contractDemands(this.state, this.dataById, r.playerId),
    }));
  }
  /** Days until a player's deal runs out (negative once it has). */
  daysUntilContractEnd(playerId: string): number | undefined {
    const c = this.state.contracts[playerId];
    return c ? daysUntilExpiry(this.state, c.expiry) : undefined;
  }
  /**
   * The free-agent market: everyone out of contract, best first, with what he wants and who else is in.
   *
   * `rivalBids` is a COUNT, not a list of clubs and numbers. A manager can see that he has competition
   * — which is what makes raising an offer a decision — without being handed the exact figure to
   * undercut by one, which would turn every race into arithmetic.
   */
  freeAgents(): FreeAgentRow[] {
    const board = this.state.freeAgentBids ?? [];
    const today = absoluteDay(this.state);
    return freeAgentPool(this.state, this.dataById).map((row) => {
      const data = this.dataById.get(row.playerId)!;
      const demands = freeAgentDemands(this.state, this.dataById, row.playerId);
      const interest = board.find((i) => i.playerId === row.playerId);
      const mine = interest?.bids.find((b) => b.clubId === this.state.managedClubId);
      return {
        playerId: row.playerId,
        name: data.name,
        position: data.position,
        age: this.state.playerDev[row.playerId]?.ageAtSeasonStart ?? data.age,
        overall: row.overall,
        value: row.value,
        photo: data.photo,
        askingWage: demands?.wage ?? 0,
        minimumWage: demands?.minimumWage ?? 0,
        wantsYears: demands?.years ?? 3,
        myBid: mine ? { wage: mine.wage, years: mine.years } : undefined,
        rivalBids: interest ? interest.bids.filter((b) => b.clubId !== this.state.managedClubId).length : 0,
        decidesInDays: interest ? Math.max(0, interest.decidesDay - today) : undefined,
      };
    });
  }

  /** Offer terms to a free agent. Replacing our own bid is how we answer being outbid. */
  bidForFreeAgent(playerId: string, wage: number, years: number): { placed: boolean; reason?: BidRefusal } {
    return bidForFreeAgent(this.state, this.dataById, playerId, this.state.managedClubId, wage, years);
  }

  /** Pull out of the race for a free agent. */
  withdrawFreeAgentBid(playerId: string): void {
    withdrawFreeAgentBid(this.state, playerId, this.state.managedClubId);
  }
  /**
   * A player's season-by-season record, oldest first.
   *
   * Empty for a career in its first season — there is genuinely nothing to plot
   * yet, and inventing a curve would be worse than an honest blank.
   */
  playerHistory(playerId: string): readonly PlayerSeason[] {
    return this.state.playerHistory?.[playerId] ?? [];
  }

  /**
   * Every attribute the player has, as WE understand it.
   *
   * Our own players come back exact; a rival's come back as bands that narrow
   * with observation, and as nothing at all below the first tier of knowledge.
   * Each entry carries its `relevance` — how much the engine's own weights say
   * it matters at his position — so a screen can show all twenty without
   * implying all twenty decide matches.
   */
  playerAttributes(playerId: string): readonly AttrKnowledge[] {
    const data = this.dataById.get(playerId);
    if (!data) return [];
    const dev = this.state.playerDev[playerId];
    const player = buildPlayer(data, dev);
    const gk = isGkData(data) ? (player as unknown as { goalkeeping?: Record<string, number> }).goalkeeping : undefined;
    const truth: Partial<Record<AttrName, number>> = {
      ...player.physical,
      ...player.mental,
      ...player.technical,
      ...(gk ? { reflexes: gk.reflexes, handling: gk.handling, gkPositioning: gk.positioning, oneOnOnes: gk.oneOnOnes } : {}),
    };
    return attributeKnowledge(truth, data.position as Position, this.confidenceIn(playerId), this.state.careerSeed, playerId);
  }
  // --- scouting -----------------------------------------------------------
  /** True when the player is registered at the club we manage. */
  private isMine(playerId: string): boolean {
    return this.state.clubs[this.state.managedClubId]?.squad.playerIds.includes(playerId) ?? false;
  }
  /** How well we know a player, 0-100. Our own are known outright. */
  confidenceIn(playerId: string): number {
    return confidenceOf(this.state.scouting, playerId, this.isMine(playerId));
  }
  /** Why we can't put him under observation at all, or null when we can. */
  scoutRefusal(playerId: string): AssignRefusal | null {
    return refuseAssignment(this.state.scouting, playerId, this.isMine(playerId));
  }
  /**
   * True when asking to watch him would put him in the LINE rather than start today.
   *
   * Separate from `scoutRefusal` because it is not a refusal — the request is accepted either way. It
   * exists so a button can say which of the two it is about to do instead of surprising him.
   */
  scoutWouldQueue(): boolean {
    return this.state.scouting.assignments.length >= this.scoutCapacity();
  }
  private scoutCapacity(): number {
    return capacityFor(this.state.clubs[this.state.managedClubId]?.reputation ?? 50);
  }
  /** Watch a player — starting now, or as soon as a scout is free. */
  scout(playerId: string): void {
    this.dispatch({ type: "assignScout", id: nextId(this.state, "watch"), playerId });
  }
  cancelScout(assignmentId: string): void {
    this.dispatch({ type: "cancelScout", assignmentId });
  }
  /** Drop someone out of the line before a scout ever got to him. */
  unqueueScout(playerId: string): void {
    this.dispatch({ type: "unqueueScout", playerId });
  }
  /** The scouting desk: what's under observation, how long it has left, and who is waiting. */
  scoutingView(): ScoutingView {
    const today = absoluteDay(this.state);
    return {
      capacity: this.scoutCapacity(),
      used: this.state.scouting.assignments.length,
      watching: this.state.scouting.assignments.map((a) => ({
        id: a.id,
        playerId: a.playerId,
        playerName: this.playerName(a.playerId),
        daysLeft: Math.max(0, a.dueDay - today),
        confidence: this.confidenceIn(a.playerId),
        nextConfidence: Math.min(MAX_RIVAL_CONFIDENCE, this.confidenceIn(a.playerId) + a.gain),
      })),
      queued: this.state.scouting.queue.map((playerId, i) => ({
        playerId,
        playerName: this.playerName(playerId),
        position: i + 1,
      })),
    };
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
