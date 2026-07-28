import type { PlayerData } from "@fut/competition";
import { InboxMessageType } from "../inbox/types.js";
import { deliverDueReports, releaseSignedPlayers } from "../scouting/ScoutingEngine.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import { answerPendingBids, expireNegotiations, pruneNegotiations } from "../transfer/NegotiationEngine.js";
import { settleAgreedFees } from "../transfer/TransferMarket.js";
import { expireContracts, warnExpiringContracts } from "../contract/expiry.js";

/**
 * Everything the passage of time does to a career, in ONE ordered pass.
 *
 * Offers expiring, scout reports landing, contracts running down — each needs
 * "has a day gone by?" and each used to have nowhere to live, so the only
 * time-driven effect in the game was a lone `resolveOutgoingOffers` call wedged
 * into the top of `advanceDay`.
 *
 * Concentrating them here buys two things the plan depends on:
 *  - a **fixed order**, so a replay produces the same state (a report that
 *    lands before an offer expires is a different world from the reverse);
 *  - **idempotence per day** — the pass records the day it last ran for, so
 *    calling it twice on the same day cannot double-age anything.
 *
 * Pure over `(state, dataById)`: no clock, no randomness that isn't seeded from
 * the state. Every effect it applies is a mutation of `state`, the same
 * convention the rest of the career layer uses.
 */
export interface DayTickResult {
  /** Days actually processed (0 when the clock hasn't moved). */
  readonly days: number;
}

export function tickDay(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): DayTickResult {
  const today = absoluteDay(state);
  const last = state.lastTickedDay ?? today;
  // A season rollover winds the day counter back; treat that as "no elapsed
  // days" rather than as time running backwards.
  const days = Math.max(0, today - last);
  state.lastTickedDay = today;

  // Fixed order, and it matters:
  //  1. what we LEARN lands first, so a report can inform the same day's deal;
  //  2. clubs answer the bids in front of them;
  //  3. anything nobody answered lapses.
  // Expiring last means a bid answered today is never also timed out today.
  deliverScoutReports(state, today);
  answerPendingBids(state, dataById, today);
  settleAgreedFees(state, dataById);
  expireNegotiations(state, today);
  pruneNegotiations(state);
  // Warn BEFORE expiring, so the last notice always precedes the loss rather
  // than landing in the same breath as it.
  warnExpiringContracts(state);
  expireContracts(state, dataById);

  return { days };
}

/**
 * File every scouting report that has come due, and free the slot it held.
 *
 * Also drops observation of anyone we have signed since: their confidence is
 * moot once they're ours, and the slot is better spent elsewhere.
 */
function deliverScoutReports(state: CareerState, todayAbsolute: number): void {
  const mine = new Set(state.clubs[state.managedClubId]?.squad.playerIds ?? []);
  releaseSignedPlayers(state.scouting, (id) => mine.has(id));

  for (const report of deliverDueReports(state.scouting, todayAbsolute, state.currentDate)) {
    state.inbox.push({
      id: nextId(state, "scout"),
      type: InboxMessageType.ScoutReport,
      date: { ...state.currentDate },
      read: false,
      params: { playerId: report.playerId, confidence: report.confidence, complete: report.complete },
    });
  }
}

/**
 * A day index that keeps increasing across seasons, for elapsed-time maths.
 * Exported because anything scheduling a future event (a scouting report, an
 * offer deadline) has to speak the same units this pass reads.
 */
export function absoluteDay(state: CareerState): number {
  return state.currentDate.season * (state.totalDays || 1) + state.currentDate.dayOfSeason;
}
