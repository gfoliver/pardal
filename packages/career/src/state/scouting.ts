import { capacityFor } from "../scouting/ScoutingEngine.js";
import type { CareerState } from "./CareerState.js";

/**
 * How many players the managed club can watch at once.
 *
 * Lives here rather than in `scouting/` because it is the one scouting question that needs the whole
 * career state — the rest of that module is a pure slice that knows nothing about clubs. And it lives
 * in exactly ONE place because it was briefly written out three times, each with its own fallback for a
 * managed club that isn't there; three copies of a guess is three chances to guess differently.
 *
 * The fallback is a floor, not an invention: a state whose managed club is missing is a broken save, and
 * the honest answer is the smallest capacity rather than a reputation nobody has.
 */
export const scoutCapacity = (state: CareerState): number => {
  const club = state.clubs[state.managedClubId];
  return club ? capacityFor(club.reputation) : capacityFor(0);
};
