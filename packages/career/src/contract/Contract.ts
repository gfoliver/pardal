import type { Money, SeasonDate } from "../time.js";

/** How the club regards a player in its squad hierarchy. */
export enum SquadStatus {
  Key = "key",
  FirstTeam = "firstTeam",
  Rotation = "rotation",
  Backup = "backup",
  Prospect = "prospect",
  Surplus = "surplus",
}

/**
 * A player's contract at a club. Immutable value object — renewals/transfers
 * produce a NEW contract rather than mutating one.
 */
export interface Contract {
  readonly playerId: string;
  readonly clubId: string;
  /** Wage per pay period (see Finance pay-day scheduling). */
  readonly wage: Money;
  readonly expiry: SeasonDate;
  readonly releaseClause?: Money;
  readonly squadStatus: SquadStatus;
  readonly signedOn: SeasonDate;
}
