import type { Money, SeasonDate } from "../time.js";

/**
 * A transfer negotiation: a conversation with a clock, rather than a flag.
 *
 * The old model was a single `TransferOffer.status` that an AI owner flipped on
 * the next advance. It had three holes the manager could feel:
 *
 *  - **no clock** — an offer nobody answered sat `pending` for the rest of the
 *    save, and (worse) halted the calendar, because time refused to move while a
 *    decision was outstanding;
 *  - **no conversation** — the answer was yes or no against one threshold, so
 *    there was nothing to negotiate;
 *  - **no reason** — a rejection said nothing, leaving the manager to guess
 *    whether to bid again or walk away.
 *
 * Every negotiation now carries a deadline, an ordered transcript of who
 * proposed what, and — when it fails — why.
 */

export type NegotiationStage =
  /** A bid is on the table, awaiting the other side. */
  | "offered"
  /** They came back with a number of their own. */
  | "countered"
  /** The clubs agree; the player has yet to. */
  | "feeAgreed"
  /** Terms are being put to the player. */
  | "personalTerms"
  | "completed"
  | "rejected"
  | "expired"
  | "withdrawn";

/** Stages where the negotiation is still alive. */
export const OPEN_STAGES: readonly NegotiationStage[] = ["offered", "countered", "feeAgreed", "personalTerms"];

export const isOpen = (n: Negotiation): boolean => OPEN_STAGES.includes(n.stage);

/**
 * Why a club said no. Surfaced to the UI so a rejection is actionable — "he's
 * not for sale at any price" and "you're 10% short" call for different moves.
 */
export type RejectionReason =
  /** The fee is below what they value him at, and too far to bridge. */
  | "belowValuation"
  /** He is central to their side; only a wild offer would move them. */
  | "keyPlayer"
  /** Selling would leave them short in that position. */
  | "squadTooThin"
  /** We've already been told no; they won't reopen it. */
  | "alreadyRefused";

export type Side = "buyer" | "seller";

/** One proposal in the transcript. */
export interface NegotiationRound {
  readonly by: Side;
  readonly fee: Money;
  readonly on: SeasonDate;
}

export interface Negotiation {
  readonly id: string;
  readonly playerId: string;
  readonly buyerClubId: string;
  readonly sellerClubId: string;
  stage: NegotiationStage;
  /** Every proposal, oldest first — the audit trail the UI renders as a thread. */
  rounds: NegotiationRound[];
  /** Set when the stage is `rejected`. */
  reason?: RejectionReason;
  /** Wage put to the player once a fee is agreed. */
  agreedFee?: Money;
  readonly openedOn: SeasonDate;
  /** Absolute day this lapses if nobody moves. */
  expiresDay: number;
}

/** How long a side has to answer before the offer lapses. */
export const OFFER_WINDOW_DAYS = 10;

/**
 * Rounds a seller will trade before their number is final.
 *
 * Bounded on purpose: an unbounded haggle would let a patient manager grind any
 * club down, and there'd be no moment where walking away is the right call.
 */
export const MAX_COUNTER_ROUNDS = 3;

/** The latest proposal from a given side, if any. */
export function lastFrom(n: Negotiation, side: Side): NegotiationRound | undefined {
  for (let i = n.rounds.length - 1; i >= 0; i--) if (n.rounds[i]!.by === side) return n.rounds[i];
  return undefined;
}

/** How many times the seller has already countered. */
export function counterCount(n: Negotiation): number {
  return n.rounds.filter((r) => r.by === "seller").length;
}

/**
 * The seller's answer to the bid on the table.
 *
 * The shape of the decision: accept anything at or above the asking price;
 * counter when the gap is bridgeable; refuse — with a reason — when it isn't, or
 * when they've already conceded as far as they will.
 */
export type SellerResponse =
  | { readonly kind: "accept" }
  | { readonly kind: "counter"; readonly fee: Money }
  | { readonly kind: "reject"; readonly reason: RejectionReason };

/** A gap wider than this is not a negotiation, it's a different conversation. */
export const BRIDGEABLE_GAP = 0.4;

/** How much of the remaining gap a seller gives up per round. */
const CONCESSION_PER_ROUND = 0.08;

export function respondToBid(opts: {
  /** What the seller wants — see `valuation.ts`. */
  readonly askingPrice: Money;
  readonly bid: Money;
  readonly countersSoFar: number;
  /** True when losing him would leave the seller short in that position. */
  readonly squadTooThin: boolean;
  readonly isKeyPlayer: boolean;
}): SellerResponse {
  if (opts.squadTooThin) return { kind: "reject", reason: "squadTooThin" };
  if (opts.bid >= opts.askingPrice) return { kind: "accept" };

  const shortfall = (opts.askingPrice - opts.bid) / Math.max(1, opts.askingPrice);
  if (shortfall > BRIDGEABLE_GAP) {
    return { kind: "reject", reason: opts.isKeyPlayer ? "keyPlayer" : "belowValuation" };
  }
  if (opts.countersSoFar >= MAX_COUNTER_ROUNDS) {
    return { kind: "reject", reason: "belowValuation" };
  }

  // Meet them part of the way, never below their bid — a "counter" under the
  // offer on the table would read as the seller bidding against themselves.
  const concession = (opts.askingPrice - opts.bid) * CONCESSION_PER_ROUND * (opts.countersSoFar + 1);
  return { kind: "counter", fee: Math.max(opts.bid, Math.round(opts.askingPrice - concession)) };
}
