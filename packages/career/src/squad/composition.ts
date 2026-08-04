import { PositionGroup, positionGroup, type Position } from "@fut/domain";
import type { PlayerData } from "@fut/competition";

/**
 * What a squad has to keep. One definition, because two of them would disagree.
 *
 * These rules govern every way a club can LOSE a player: selling, loaning out, and now letting a
 * contract lapse. They were private to the transfer market, so renewals had no idea a club was
 * already down to its last two keepers — an AI club could sell to the floor and then release below it.
 *
 * They bind AI clubs ONLY. A human manager is free to run his squad into the ground: he gets the
 * expiry warnings, and ignoring them is his decision to answer for. What the AI must never do is
 * quietly dissolve the league around him.
 */

/** Fewest players an AI club will let itself go down to. */
export const MIN_SQUAD = 16;

/**
 * Most an AI club will carry before it stops signing players it does not need.
 *
 * A ceiling is as necessary as a floor, and it was learnt the hard way: with free agency wired up and
 * nothing capping the opportunistic path, one club had hoarded NINETY players inside five seasons.
 * Every free agent better than its worst man in that line was an upgrade, and a wealthy club never
 * runs out of "better than my worst".
 *
 * Above this a club will still fill a genuine hole — a squad of forty with one keeper needs a keeper —
 * because the per-line minimums are about being able to field a side, not about size. Set above the
 * dataset's own largest squad so a club that starts deep is not immediately frozen out of the market.
 *
 * The manager has no ceiling, the same way he has no floor: how deep he runs his squad is his call,
 * and the wage bill is what argues with him.
 */
export const MAX_SQUAD = 42;

/** Fewest it will keep in each line. Sums to 18, so the group rules bite before the total does. */
export const REQUIRED_PER_GROUP: Readonly<Record<PositionGroup, number>> = {
  [PositionGroup.Goalkeeper]: 2,
  [PositionGroup.Defence]: 6,
  [PositionGroup.Midfield]: 6,
  [PositionGroup.Attack]: 4,
};

/** Every position group, in a fixed order — iteration order must not depend on object keys. */
export const GROUPS: readonly PositionGroup[] = [
  PositionGroup.Goalkeeper,
  PositionGroup.Defence,
  PositionGroup.Midfield,
  PositionGroup.Attack,
];

/** How many of each line a squad holds. */
export function groupCounts(
  playerIds: readonly string[],
  groupOf: (id: string) => PositionGroup,
): Record<PositionGroup, number> {
  const counts: Record<PositionGroup, number> = {
    [PositionGroup.Goalkeeper]: 0,
    [PositionGroup.Defence]: 0,
    [PositionGroup.Midfield]: 0,
    [PositionGroup.Attack]: 0,
  };
  for (const id of playerIds) counts[groupOf(id)]++;
  return counts;
}

/**
 * Could this club afford to lose this player?
 *
 * False when it would breach the total or leave his line short. Asked before a sale, a loan out and a
 * refused renewal, so all three answer the same way.
 */
export function canRelease(
  playerIds: readonly string[],
  playerId: string,
  dataById: ReadonlyMap<string, PlayerData>,
): boolean {
  if (playerIds.length <= MIN_SQUAD) return false;
  const data = dataById.get(playerId);
  if (!data) return true; // not really in the squad; losing him costs nothing
  const groupOf = (id: string): PositionGroup => {
    const d = dataById.get(id);
    return d ? positionGroup(d.position as Position) : PositionGroup.Midfield;
  };
  const group = groupOf(playerId);
  return groupCounts(playerIds, groupOf)[group] > REQUIRED_PER_GROUP[group];
}
