import type { DatedFixture, FixtureResult } from "@fut/competition";
import type { Club } from "../club/Club.js";
import type { Contract } from "../contract/Contract.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import type { InboxMessage } from "../inbox/types.js";
import type { CompetitionStructure } from "../structure/types.js";
import type { ScoutingState } from "../scouting/types.js";
import type { TransferState } from "../transfer/types.js";
import type { Negotiation } from "../transfer/Negotiation.js";
import type { SeasonDate } from "../time.js";

/** A live competition within the season: its fixtures (dated) + append-only
 *  results. Standings/stats are recomputed from `results`, never stored. */
export interface CareerCompetition {
  readonly id: string;
  readonly kind: "league" | "cup";
  readonly divisionId?: string;
  readonly seed: number;
  readonly teamIds: string[];
  readonly fixtures: DatedFixture[];
  results: FixtureResult[];
  /** fixtureIndexes already played (so results stay append-only + resumable). */
  playedFixtureIndexes: number[];
}

/** One season in a player's development record. */
export interface PlayerSeason {
  readonly season: number;
  readonly age: number;
  /** Current ability on the 0-200 scale. */
  readonly ca: number;
  /** Effective overall on the 1-99 scale — the number the UI shows. */
  readonly overall: number;
  readonly appearances: number;
  readonly goals: number;
}

/**
 * The full career world state. Mutated ONLY through the pure `apply(state,
 * command)` reducer, so a save = careerSeed + the command log, and everything
 * derived (tables, stats, market values) is recomputed — never trusted from a
 * client, which is what makes it server-auditable later.
 *
 * NOTE (milestone growth): competitions{seed,fixtures,results}, calendar and
 * cup brackets join here in M2/M3; only the M1 foundation fields exist so far.
 */
export interface CareerState {
  readonly version: number;
  readonly careerSeed: number;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly managedClubId: string;
  /** Real-calendar anchor: epoch day (since 1970-01-01) of season 0, day 0. */
  readonly startEpochDay: number;
  currentDate: SeasonDate;
  structure: CompetitionStructure;
  competitions: CareerCompetition[];
  /** Days in the current season (max fixture day + buffer). */
  totalDays: number;
  clubs: Record<string, Club>;
  /** One current contract per contracted player (keyed by playerId). */
  contracts: Record<string, Contract>;
  /**
   * `playerId:milestone` pairs already warned about, so a 6-month notice is
   * given once rather than every day until it stops being news.
   */
  contractsWarned?: Record<string, boolean>;
  /** Players whose contract ran out — signable for nothing but a wage. */
  freeAgentIds?: string[];
  playerDev: Record<string, PlayerDev>;
  /**
   * Append-only ability record, one point per season, written at the rollover.
   *
   * Development only happens at the rollover (`progressSeason`), so the grain is
   * a season by construction — this stores what actually varies rather than
   * pretending to sample something daily.
   */
  playerHistory?: Record<string, PlayerSeason[]>;
  transfers: TransferState;
  /** Live and recently-closed transfer conversations. See `transfer/Negotiation`. */
  negotiations: Negotiation[];
  /** Observation capacity, who is under it, and what it has taught us. */
  scouting: ScoutingState;
  /**
   * LEGACY: the pre-scouting-model list of "revealed" players. Kept so an old
   * save can be migrated into `scouting.knowledge`; nothing reads it otherwise.
   */
  scoutedPlayerIds: string[];
  /** The manager's shortlist / transfer targets. */
  targetPlayerIds: string[];
  inbox: InboxMessage[];
  /**
   * Monotonic source of entity ids (offers, inbox messages, …). Lives in the
   * state — not in a module counter — so replaying a command log mints exactly
   * the same ids. See `state/ids.ts`.
   */
  nextEntityId: number;
  /**
   * Absolute day the time-driven pass last ran for, so it can't process the
   * same day twice. See `time/tickDay.ts`.
   */
  lastTickedDay?: number;
  /** Set when the board sacks the manager (ends the current job). */
  managerSacked?: boolean;
}

/**
 * The serializable save projection. Base player/team reference data is NOT
 * stored (rehydrated from the dataset by id); derived views are recomputed.
 * For the M1 foundation it mirrors CareerState; it diverges once competitions/
 * results (append-only) land, which is what actually gets persisted.
 */
export type CareerSnapshot = CareerState;
