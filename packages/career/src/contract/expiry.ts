import type { PlayerData } from "@fut/competition";
import { InboxMessageType } from "../inbox/types.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import type { SeasonDate } from "../time.js";

/**
 * Contracts that actually run out.
 *
 * `Contract.expiry` was written on every signing and read by nothing. At the
 * season rollover every expiring deal was silently pushed two years out and the
 * manager was merely *told* it had been renewed — so no squad could ever lose a
 * player, and `InboxMessageType.ContractExpiring` sat unused in the enum.
 *
 * The warnings below are the pressure, and `expireContracts` is the thing that
 * makes them worth reading.
 */

/** Days out at which the manager gets a warning. Coarse to fine. */
export const WARNING_DAYS: readonly number[] = [180, 90, 30];

/** Days from now until a contract lapses (negative once it has). */
export function daysUntilExpiry(state: CareerState, expiry: SeasonDate): number {
  const perSeason = state.totalDays || 1;
  const now = state.currentDate.season * perSeason + state.currentDate.dayOfSeason;
  return expiry.season * perSeason + expiry.dayOfSeason - now;
}

/**
 * Warn about our own contracts running down — once per milestone.
 *
 * `contractsWarned` records which (player, milestone) pairs have already been
 * raised. Without it a warning would repeat every single day, and the manager
 * would learn to ignore the one message that matters.
 */
export function warnExpiringContracts(state: CareerState): void {
  const warned = (state.contractsWarned ??= {});
  for (const [playerId, contract] of Object.entries(state.contracts)) {
    if (contract.clubId !== state.managedClubId) continue;
    const left = daysUntilExpiry(state, contract.expiry);
    // The tightest milestone this contract has crossed.
    const milestone = WARNING_DAYS.find((d) => left <= d && left > 0);
    if (milestone === undefined) continue;
    const key = `${playerId}:${milestone}`;
    if (warned[key]) continue;
    warned[key] = true;
    state.inbox.push({
      id: nextId(state, "exp"),
      type: InboxMessageType.ContractExpiring,
      date: { ...state.currentDate },
      read: false,
      params: { playerId, daysLeft: left, milestone },
    });
  }
}

/**
 * Let lapsed contracts lapse: the player leaves on a free.
 *
 * AI clubs renew their own people automatically — the drama of losing someone
 * for nothing is the manager's to feel, and making twenty AI squads dissolve
 * each season would just churn the league.
 */
export function expireContracts(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  for (const [playerId, contract] of Object.entries(state.contracts)) {
    if (daysUntilExpiry(state, contract.expiry) > 0) continue;

    if (contract.clubId !== state.managedClubId) {
      // The AI keeps its house in order.
      state.contracts[playerId] = { ...contract, expiry: { season: contract.expiry.season + 2, dayOfSeason: 0 } };
      continue;
    }

    const club = state.clubs[contract.clubId];
    if (club) club.squad.playerIds = club.squad.playerIds.filter((id) => id !== playerId);
    delete state.contracts[playerId];
    (state.freeAgentIds ??= []).push(playerId);
    for (const key of Object.keys(state.contractsWarned ?? {})) {
      if (key.startsWith(`${playerId}:`)) delete state.contractsWarned![key];
    }
    state.inbox.push({
      id: nextId(state, "exp"),
      type: InboxMessageType.ContractLapsed,
      date: { ...state.currentDate },
      read: false,
      params: { playerId, name: dataById.get(playerId)?.name ?? playerId },
    });
  }
}

/** Our players whose deal runs out inside `days`, most valuable first. */
export function expiringSoon(state: CareerState, days = 180): { playerId: string; daysLeft: number }[] {
  return Object.entries(state.contracts)
    .filter(([, c]) => c.clubId === state.managedClubId)
    .map(([playerId, c]) => ({ playerId, daysLeft: daysUntilExpiry(state, c.expiry) }))
    .filter((r) => r.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || (a.playerId < b.playerId ? -1 : 1));
}
