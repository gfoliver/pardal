import type { PlayerData } from "@fut/competition";
import { InboxMessageType } from "../inbox/types.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import {
  BRIDGEABLE_GAP,
  MAX_COUNTER_ROUNDS,
  OFFER_WINDOW_DAYS,
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

/** Open a negotiation the manager has started. Returns it, or why not. */
export function openNegotiation(
  state: CareerState,
  opts: { id: string; playerId: string; fee: number; todayAbsolute: number },
): Negotiation | undefined {
  const sellerClubId = Object.keys(state.clubs).find(
    (cid) => cid !== state.managedClubId && state.clubs[cid]!.squad.playerIds.includes(opts.playerId),
  );
  if (!sellerClubId) return undefined;
  if (state.negotiations.some((n) => n.playerId === opts.playerId && n.buyerClubId === state.managedClubId && isOpen(n))) {
    return undefined; // one conversation at a time
  }
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
      push(state, InboxMessageType.PersonalTerms, { playerId: n.playerId, fromClubId: n.sellerClubId, fee: bid.fee });
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
    n.stage = "expired";
    // Only worth telling the manager about deals that were still theirs to make.
    const waitingOnUs = n.buyerClubId === state.managedClubId ? n.stage === "expired" : true;
    if (waitingOnUs) push(state, InboxMessageType.TransferExpired, { playerId: n.playerId, clubId: n.buyerClubId === state.managedClubId ? n.sellerClubId : n.buyerClubId });
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
