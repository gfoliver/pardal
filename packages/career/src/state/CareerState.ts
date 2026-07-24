import type { Club } from "../club/Club.js";
import type { PlayerDev } from "../development/PlayerDev.js";
import type { InboxMessage } from "../inbox/types.js";
import type { CompetitionStructure } from "../structure/types.js";
import type { TransferState } from "../transfer/types.js";
import type { SeasonDate } from "../time.js";

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
  currentDate: SeasonDate;
  structure: CompetitionStructure;
  clubs: Record<string, Club>;
  playerDev: Record<string, PlayerDev>;
  transfers: TransferState;
  inbox: InboxMessage[];
}

/**
 * The serializable save projection. Base player/team reference data is NOT
 * stored (rehydrated from the dataset by id); derived views are recomputed.
 * For the M1 foundation it mirrors CareerState; it diverges once competitions/
 * results (append-only) land, which is what actually gets persisted.
 */
export type CareerSnapshot = CareerState;
