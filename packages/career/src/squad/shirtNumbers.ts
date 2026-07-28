import type { PlayerData } from "@fut/competition";
import type { CareerState } from "../state/CareerState.js";

/**
 * Who wears what at a club: the numbers the dataset registered, with the
 * manager's own assignments on top.
 *
 * Pure, and shared by the façade (which shows the numbers) and the team builder
 * (which puts them on the shirts in a match) — the same resolution has to answer
 * both, or the squad screen and the pitch would disagree about who is 10.
 *
 * Two players CAN arrive holding the same number: sign another club's number 9
 * and he meets ours. Rather than invent a number for the loser, this leaves him
 * without one — which the UI shows as blank, and the manager can fix. Silently
 * renumbering him would be a change he never made and can't see.
 */
export function resolveSquadNumbers(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  clubId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const squad = state.clubs[clubId]?.squad.playerIds;
  if (!squad) return out;

  const taken = new Set<number>();
  const overrides = state.shirtNumbers ?? {};
  // The manager's own choices are claimed first: an explicit decision outranks
  // whatever the source happened to register.
  for (const id of squad) {
    const n = overrides[id];
    if (n !== undefined && !taken.has(n)) {
      out.set(id, n);
      taken.add(n);
    }
  }
  for (const id of squad) {
    if (out.has(id)) continue;
    const n = dataById.get(id)?.shirtNumber;
    if (n !== undefined && !taken.has(n)) {
      out.set(id, n);
      taken.add(n);
    }
  }
  return out;
}
