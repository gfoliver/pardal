import type { PlayerData } from "@fut/competition";
import { InboxMessageType } from "../inbox/types.js";
import { deliverDueReports, releaseSignedPlayers } from "../scouting/ScoutingEngine.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import { answerPendingBids, expireNegotiations, pruneNegotiations } from "../transfer/NegotiationEngine.js";
import { generateUserOffers, runTransferWindow, settleAgreedFees } from "../transfer/TransferMarket.js";
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
  // LAST, so a day resolves the manager's existing business before the market moves
  // around him, and so an offer that arrives today always gets its full window rather
  // than being created and expired in the same pass.
  runMarketWindows(state, dataById, last, today);

  return { days };
}

/**
 * How often the rest of the league does business, and how often somebody comes asking
 * about our players. In days.
 *
 * Both of these used to be effectively never. `runTransferWindow` had no caller outside
 * the tests, so AI clubs never traded with each other at all; `generateUserOffers` ran
 * only at career creation and at season rollover, which is exactly the reported symptom
 * that offers "only happen on the first day of the season". Neither was a tuning
 * problem — the code was simply not wired to the clock.
 *
 * They are deliberately different numbers and coprime, so the two never fall on the
 * same day every time and the market does not arrive in lumps.
 */
const AI_WINDOW_DAYS = 13;
const INTEREST_DAYS = 9;

/**
 * Run each market pass once per boundary CROSSED, rather than "if today is a multiple".
 *
 * The clock does not move a day at a time: `advanceToNextMatchDay` jumps straight to the
 * next fixture, so a multiple-of-N test would silently skip most windows. Working from
 * the span `(last, today]` also makes the pass idempotent — re-ticking the same day
 * crosses no new boundary and does nothing.
 */
function runMarketWindows(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  fromDay: number,
  toDay: number,
): void {
  for (const w of boundariesCrossed(fromDay, toDay, AI_WINDOW_DAYS)) {
    runTransferWindow(state, dataById, w);
  }
  for (const w of boundariesCrossed(fromDay, toDay, INTEREST_DAYS)) {
    // Offset the tick so this stream's seed can never collide with the AI window's,
    // which would tie the two to each other.
    generateUserOffers(state, dataById, w);
  }
}

function boundariesCrossed(fromDay: number, toDay: number, every: number): number[] {
  const first = Math.floor(fromDay / every) + 1;
  const last = Math.floor(toDay / every);
  const out: number[] = [];
  for (let w = first; w <= last; w++) out.push(w);
  return out;
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
      params: {
        playerId: report.playerId,
        confidence: report.confidence,
        complete: report.complete,
        // Absent on the last report. Its presence is what tells the manager the scout is
        // staying on him rather than waiting to be sent back out.
        ...(report.nextConfidence !== undefined ? { next: report.nextConfidence } : {}),
      },
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
