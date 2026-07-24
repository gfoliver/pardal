import type { DatedFixture, FixtureResult } from "@fut/competition";
import type { Club } from "../club/Club.js";
import type { Contract } from "../contract/Contract.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import type { InboxMessage } from "../inbox/types.js";
import type { CompetitionStructure } from "../structure/types.js";
import type { TransferState } from "../transfer/types.js";
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
  playerDev: Record<string, PlayerDev>;
  transfers: TransferState;
  /** Players the manager has scouted (potential revealed). */
  scoutedPlayerIds: string[];
  inbox: InboxMessage[];
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
