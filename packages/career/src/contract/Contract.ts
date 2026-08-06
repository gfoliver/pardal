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
  /**
   * When the player last CHANGED CLUB, as opposed to when his current contract was signed.
   *
   * Two different facts, and `signedOn` cannot serve both: a renewal signs a new contract without
   * anybody moving, and it rewrites `signedOn` accordingly. Reading that as a transfer date put every
   * renewed player on a six-month transfer cooldown for staying exactly where he was.
   *
   * Optional, so a save written before this loads — and absent means "we have no record of him moving",
   * which is the truth for a career that started before the field existed and for every player who was
   * at his club on day one. `offCooldown` treats that as free to move.
   */
  readonly lastTransferOn?: SeasonDate;
}
