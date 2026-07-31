import type { CareerState } from "../state/CareerState.js";
import type { TransferListing } from "./types.js";

/**
 * The transfer list: the players a club has publicly put up for sale.
 *
 * `TransferListing` has existed as a type — and `TransferState.listings` as an array —
 * since the career layer was written, with no command that wrote one and nothing that
 * read one. This module is the missing half.
 *
 * What listing actually DOES lives in `TransferMarket.generateUserOffers`: a listed
 * player is offered for whatever his standing, comes up far more often, and draws a bid
 * at the manager's own asking price when that price is defensible. Consent is untouched —
 * a listing invites offers, it does not pre-authorise a sale, so every bid still arrives
 * as a negotiation the manager answers.
 */

/**
 * The listings that still mean something: a player is on the block only while he is
 * actually registered at the club that listed him.
 *
 * Current ownership is the source of truth rather than a second piece of bookkeeping, so
 * no code path has to remember to delete a row when a player is sold, loaned out, or
 * walks off on a free. The loan list is the cautionary tale for the other approach — it
 * recorded an expiry date that nothing ever read, and once loans started being created
 * that left 75 players stranded at the wrong clubs by the third season.
 */
export function activeListings(state: CareerState): TransferListing[] {
  return state.transfers.listings.filter((l) => state.clubs[l.clubId]?.squad.playerIds.includes(l.playerId) ?? false);
}

/** Every player the given club has listed. */
export function listingsBy(state: CareerState, clubId: string): TransferListing[] {
  return activeListings(state).filter((l) => l.clubId === clubId);
}

export function listingFor(state: CareerState, playerId: string): TransferListing | undefined {
  return activeListings(state).find((l) => l.playerId === playerId);
}

export function isListed(state: CareerState, playerId: string): boolean {
  return listingFor(state, playerId) !== undefined;
}

/**
 * Forget the listings `activeListings` already ignores, so the array cannot grow
 * without bound across a long career. Purely housekeeping: it can never change
 * what anything observes.
 */
export function pruneListings(state: CareerState): number {
  const keep = new Set(activeListings(state));
  const before = state.transfers.listings.length;
  state.transfers.listings = state.transfers.listings.filter((l) => keep.has(l));
  return before - state.transfers.listings.length;
}
