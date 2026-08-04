import type { PlayerData } from "@fut/competition";
import { InboxMessageType } from "../inbox/types.js";
import { nextId } from "../state/ids.js";
import type { CareerState } from "../state/CareerState.js";
import type { SeasonDate } from "../time.js";
import { reconcileTactics } from "../tactics/StoredTactics.js";
import { SeededRandom } from "@fut/engine";
import { renewalSeed } from "../rng/seeds.js";
import { aiRenewalTerms, decideRenewal } from "./renewal.js";

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
 * An AI club now DECIDES, rather than re-signing everybody forever (see `decideRenewal`). That
 * change matters beyond realism: the manager used to be the only person in the league who ever lost
 * anyone, so a free transfer was a thing that only happened to him. Now a rival's fringe player,
 * or a name past his best on wages his club resents, can come loose.
 *
 * The floor lives in `decideRenewal` and binds AI clubs only. The manager gets no such protection:
 * he is warned at 180, 90 and 30 days, and a squad he lets run down is his to answer for — a club
 * that cannot field eleven forfeits (see `CareerRunner`).
 */
export function expireContracts(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  // One stream for the whole rollover, seeded from the season, so the decisions do not depend on
  // which club happened to be processed first.
  const rng = new SeededRandom(renewalSeed(state.careerSeed, state.currentDate.season));

  for (const [playerId, contract] of Object.entries(state.contracts)) {
    if (daysUntilExpiry(state, contract.expiry) > 0) continue;

    if (contract.clubId !== state.managedClubId) {
      const decision = decideRenewal(state, dataById, playerId, rng);
      if (decision.renew) {
        const terms = aiRenewalTerms(state, dataById, playerId);
        state.contracts[playerId] = {
          ...contract,
          wage: terms.wage,
          // From today, keeping the day of the season — the same rule the manager's deals follow.
          expiry: { season: state.currentDate.season + terms.years, dayOfSeason: state.currentDate.dayOfSeason },
          signedOn: { ...state.currentDate },
        };
        continue;
      }
      // Refused: he leaves on a free, exactly as one of ours would.
      release(state, dataById, playerId, contract.clubId);
      continue;
    }

    release(state, dataById, playerId, contract.clubId);
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

/** Take a player off a club's books and put him in the free-agent pool. */
function release(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string, clubId: string): void {
  const club = state.clubs[clubId];
  if (club) {
    club.squad.playerIds = club.squad.playerIds.filter((id) => id !== playerId);
    // A lapsed contract is a roster change like any other: leave him in the lineup and the
    // match still fields a player the club no longer employs.
    reconcileTactics(club, dataById, new Map(Object.values(state.playerDev).map((d) => [d.playerId, d])));
  }
  delete state.contracts[playerId];
  const pool = (state.freeAgentIds ??= []);
  if (!pool.includes(playerId)) pool.push(playerId);
}

/** Our players whose deal runs out inside `days`, most valuable first. */
export function expiringSoon(state: CareerState, days = 180): { playerId: string; daysLeft: number }[] {
  return Object.entries(state.contracts)
    .filter(([, c]) => c.clubId === state.managedClubId)
    .map(([playerId, c]) => ({ playerId, daysLeft: daysUntilExpiry(state, c.expiry) }))
    .filter((r) => r.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || (a.playerId < b.playerId ? -1 : 1));
}
