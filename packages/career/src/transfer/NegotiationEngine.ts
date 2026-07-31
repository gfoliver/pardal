import type { PlayerData } from "@fut/competition";
import { feeHeadroom } from "../club/Finance.js";
import { InboxMessageType } from "../inbox/types.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import {
  BRIDGEABLE_GAP,
  MAX_COUNTER_ROUNDS,
  OFFER_WINDOW_DAYS,
  PERSONAL_TERMS_DAYS,
  counterCount,
  isOpen,
  lastFrom,
  respondToBid,
  type Negotiation,
  type NegotiationStage,
} from "./Negotiation.js";
import { buyerCeiling, sellerStance } from "./valuation.js";

/**
 * Driving negotiations forward: opening them, answering them, and — the part
 * that was missing entirely — letting them run out.
 *
 * Impure over `state` in the same way the rest of the career layer is, but with
 * no clock and no unseeded randomness, so a replay reproduces every deal.
 */

/**
 * Money already promised in bids that are still live.
 *
 * Without this, a manager with 40M could have four separate 40M bids open and find himself
 * having bought all four. A bid is a commitment until it is answered.
 */
export function committedToOpenBids(state: CareerState): number {
  let sum = 0;
  for (const n of state.negotiations) {
    if (n.buyerClubId !== state.managedClubId || !isOpen(n)) continue;
    sum += n.agreedFee ?? lastFrom(n, "buyer")?.fee ?? 0;
  }
  return sum;
}

/**
 * Why a bid cannot be lodged, or `null` when it can.
 *
 * A REASON rather than a bare failure, because "offer failed" is the least useful thing a
 * transfer screen can say: the manager cannot tell whether to bid again, sell somebody
 * first, or stop trying. Three quite different situations used to collapse into one
 * `undefined`.
 */
export type OfferRefusal = "notForSale" | "alreadyBidding" | "overBudget" | "noFee";

export function refuseOffer(state: CareerState, playerId: string, fee: number): OfferRefusal | null {
  const owner = Object.keys(state.clubs).find(
    (cid) => cid !== state.managedClubId && state.clubs[cid]!.squad.playerIds.includes(playerId),
  );
  if (!owner) return "notForSale";
  if (state.negotiations.some((n) => n.playerId === playerId && n.buyerClubId === state.managedClubId && isOpen(n))) {
    return "alreadyBidding"; // one conversation at a time
  }
  if (!Number.isFinite(fee) || fee <= 0) return "noFee";
  // The manager is bound by the same pot the AI is. Checked in the engine rather than only
  // in the dialog, so the budget is a rule of the world instead of a disabled button — and
  // so a bid we already have on the table counts against the next one.
  if (fee > feeHeadroom(state, state.managedClubId) - committedToOpenBids(state)) return "overBudget";
  return null;
}

/** The most we could bid for anybody right now. */
export function bidHeadroom(state: CareerState): number {
  return Math.max(0, feeHeadroom(state, state.managedClubId) - committedToOpenBids(state));
}

/** Open a negotiation the manager has started. Returns it, or nothing when refused. */
export function openNegotiation(
  state: CareerState,
  opts: { id: string; playerId: string; fee: number; todayAbsolute: number },
): Negotiation | undefined {
  if (refuseOffer(state, opts.playerId, opts.fee)) return undefined;
  const sellerClubId = Object.keys(state.clubs).find(
    (cid) => cid !== state.managedClubId && state.clubs[cid]!.squad.playerIds.includes(opts.playerId),
  )!;
  return {
    id: opts.id,
    playerId: opts.playerId,
    buyerClubId: state.managedClubId,
    sellerClubId,
    stage: "offered",
    rounds: [{ by: "buyer", fee: opts.fee, on: { ...state.currentDate } }],
    openedOn: { ...state.currentDate },
    expiresDay: opts.todayAbsolute + OFFER_WINDOW_DAYS,
  };
}

/**
 * The selling club answers every bid that is waiting on them.
 *
 * Runs on the day tick, so an answer costs the manager time rather than
 * arriving the instant they click.
 */
export function answerPendingBids(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  todayAbsolute: number,
): void {
  for (const n of state.negotiations) {
    // A rival BUYER answering the price we named for one of our players.
    if (n.stage === "countered" && n.sellerClubId === state.managedClubId) {
      answerOurAskingPrice(state, dataById, n, todayAbsolute);
      continue;
    }
    // Otherwise: a rival SELLER answering a bid we made.
    if (n.stage !== "offered" || n.buyerClubId !== state.managedClubId) continue;
    const bid = lastFrom(n, "buyer");
    if (!bid) continue;

    const stance = sellerStance(state, dataById, n.playerId);
    const response = respondToBid({
      askingPrice: stance.askingPrice,
      bid: bid.fee,
      countersSoFar: counterCount(n),
      squadTooThin: stance.squadTooThin,
      isKeyPlayer: stance.isKeyPlayer,
    });

    if (response.kind === "accept") {
      n.stage = "feeAgreed";
      n.agreedFee = bid.fee;
      // A new task starts here — talking to the PLAYER — so it gets its own,
      // longer deadline. Leaving the bid clock running meant a fee you had just
      // agreed could lapse before you had chosen a wage to offer.
      n.expiresDay = todayAbsolute + PERSONAL_TERMS_DAYS;
      push(state, InboxMessageType.PersonalTerms, { playerId: n.playerId, fromClubId: n.sellerClubId, fee: bid.fee, days: PERSONAL_TERMS_DAYS });
    } else if (response.kind === "counter") {
      n.stage = "countered";
      n.rounds.push({ by: "seller", fee: response.fee, on: { ...state.currentDate } });
      n.expiresDay = todayAbsolute + OFFER_WINDOW_DAYS; // the ball is in our court again
      push(state, InboxMessageType.TransferCountered, { playerId: n.playerId, clubId: n.sellerClubId, fee: response.fee });
    } else {
      n.stage = "rejected";
      n.reason = response.reason;
      push(state, InboxMessageType.TransferRejected, { playerId: n.playerId, clubId: n.sellerClubId, fee: bid.fee, reason: response.reason });
    }
  }
}

/**
 * A rival buyer answers the price we asked for one of OUR players.
 *
 * The mirror of the seller logic, and the thing that makes a received offer a
 * negotiation rather than a yes/no: they pay up if our number is inside what
 * they'll go to, edge closer if it isn't but is close, and walk when it plainly
 * isn't happening. Their ceiling is real (`buyerCeiling`) — a club can't be
 * talked past its budget however long the manager holds out.
 */
function answerOurAskingPrice(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  n: Negotiation,
  todayAbsolute: number,
): void {
  const ask = lastFrom(n, "seller");
  const theirBid = lastFrom(n, "buyer");
  if (!ask || !theirBid) return;

  const ceiling = buyerCeiling(state, dataById, n.playerId, n.buyerClubId);
  if (ask.fee <= ceiling) {
    n.stage = "feeAgreed";
    n.agreedFee = ask.fee;
    push(state, InboxMessageType.TransferAccepted, { playerId: n.playerId, clubId: n.buyerClubId, fee: ask.fee });
    return;
  }

  // Too rich for them, but close enough to keep talking — and only so many
  // times, or a patient manager could ratchet any club upwards forever.
  const gap = (ask.fee - theirBid.fee) / Math.max(1, ask.fee);
  const improved = Math.min(ceiling, Math.round(theirBid.fee + (ask.fee - theirBid.fee) * 0.5));
  if (gap <= BRIDGEABLE_GAP && improved > theirBid.fee && counterCount(n) < MAX_COUNTER_ROUNDS) {
    n.stage = "offered";
    n.rounds.push({ by: "buyer", fee: improved, on: { ...state.currentDate } });
    n.expiresDay = todayAbsolute + OFFER_WINDOW_DAYS;
    push(state, InboxMessageType.TransferOfferReceived, { playerId: n.playerId, fromClubId: n.buyerClubId, fee: improved });
    return;
  }

  n.stage = "withdrawn";
  push(state, InboxMessageType.TransferExpired, { playerId: n.playerId, clubId: n.buyerClubId });
}

/**
 * Time out everything nobody answered.
 *
 * This is what makes ignoring an offer a decision with a cost rather than a way
 * to keep it alive forever — and it is why the calendar no longer has to stop
 * and wait for the manager.
 */
export function expireNegotiations(state: CareerState, todayAbsolute: number): void {
  for (const n of state.negotiations) {
    if (!isOpen(n) || n.expiresDay > todayAbsolute) continue;
    // Losing a deal whose fee was already agreed is a different failure from a
    // bid nobody answered, and telling the manager the same thing for both is
    // how you get "the clubs never respond" — he never learns that the step he
    // missed was the PLAYER's contract, not the club's answer.
    const feeWasAgreed = n.stage === "feeAgreed" || n.stage === "personalTerms";
    n.stage = "expired";
    push(
      state,
      feeWasAgreed ? InboxMessageType.PersonalTermsExpired : InboxMessageType.TransferExpired,
      { playerId: n.playerId, clubId: n.buyerClubId === state.managedClubId ? n.sellerClubId : n.buyerClubId },
    );
  }
}

/** Drop long-settled negotiations so the save doesn't grow without bound. */
export function pruneNegotiations(state: CareerState, keepClosed = 40): void {
  const closed = state.negotiations.filter((n) => !isOpen(n));
  if (closed.length <= keepClosed) return;
  const drop = new Set(closed.slice(0, closed.length - keepClosed).map((n) => n.id));
  state.negotiations = state.negotiations.filter((n) => !drop.has(n.id));
}

export function findNegotiation(state: CareerState, id: string): Negotiation | undefined {
  return state.negotiations.find((n) => n.id === id);
}

/** Mark a negotiation closed by our own hand. */
export function closeNegotiation(state: CareerState, id: string, stage: NegotiationStage): void {
  const n = findNegotiation(state, id);
  if (n && isOpen(n)) n.stage = stage;
}

function push(state: CareerState, type: InboxMessageType, params: Record<string, string | number | boolean>): void {
  state.inbox.push({ id: nextId(state, "txn"), type, date: { ...state.currentDate }, read: false, params });
}
