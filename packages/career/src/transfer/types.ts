import type { Money, SeasonDate } from "../time.js";

export enum OfferStatus {
  Pending = "pending",
  Accepted = "accepted",
  Rejected = "rejected",
  Withdrawn = "withdrawn",
  Completed = "completed",
}

export interface TransferListing {
  readonly playerId: string;
  readonly clubId: string;
  readonly askingPrice: Money;
  readonly listedOn: SeasonDate;
  readonly loanOnly?: boolean;
}

export interface TransferOffer {
  readonly id: string;
  readonly playerId: string;
  readonly fromClubId: string; // buyer
  readonly toClubId: string; // seller (current owner)
  readonly fee: Money;
  readonly proposedWage: Money;
  readonly contractYears: number;
  status: OfferStatus;
  readonly createdOn: SeasonDate;
}

export interface Loan {
  readonly playerId: string;
  readonly ownerClubId: string;
  readonly borrowerClubId: string;
  readonly until: SeasonDate;
  /** Fraction of wage the borrower pays, 0..1. */
  readonly wageSharePct: number;
}

/** A completed fee agreement awaiting personal terms with the player (the new
 *  club must agree a contract before the signing is final). */
export interface PendingSigning {
  readonly playerId: string;
  readonly fromClubId: string;
  readonly toClubId: string;
  readonly fee: Money;
}

export interface TransferState {
  listings: TransferListing[];
  offers: TransferOffer[];
  loans: Loan[];
  /** Fee-agreed moves awaiting a contract with the player. */
  signings?: PendingSigning[];
}
