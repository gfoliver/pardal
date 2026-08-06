/** What the board expects this season and how happy they currently are. */
export interface BoardObjectives {
  /**
   * Target final league position (1 = win the title).
   *
   * Mutable, like `confidence`, and it was `readonly` only because nothing ever revised it — which was
   * the defect rather than the design. `retargetBoards` rewrites it every rollover, because the target
   * is relative to the division and a club can change division.
   */
  leaguePositionTarget: number;
  /** Optional cup expectation (round to reach), by competitionId. */
  readonly cupTargets: Readonly<Record<string, number>>;
  /** Board confidence 0..100 (drives sack risk). */
  confidence: number;
}

export function newObjectives(leaguePositionTarget: number): BoardObjectives {
  return { leaguePositionTarget, cupTargets: {}, confidence: 60 };
}

/**
 * Where a board expects to finish, from where the club's means place it IN ITS OWN DIVISION.
 *
 * It used to read absolute reputation — 78 and up expect the title, 70 fourth, 62 eighth, otherwise
 * twelfth — and reputation is derived from market value across the whole world. In a two-division
 * dataset that means every second-tier club sits in the bottom band, so all twenty of them were told
 * to finish twelfth, and the club that should be walking the division was set the same target as the
 * one fighting relegation from it. Worse, it was set once at career creation and never revised, so a
 * promoted club carried its Série B objective into Série A and a relegated giant carried "win the
 * league" down with it — which, by luck, is the one case the old code got right.
 *
 * Relative to its own league, the same shape means what it says: the richest tenth are expected to
 * win it, the top quarter to be near the front, the top half to be respectable, and the rest to be
 * mid-table. `rank` is 0-based by reputation, best first.
 */
export function divisionTarget(rank: number, divisionSize: number): number {
  if (divisionSize <= 0) return 1;
  const percentile = (rank + 1) / divisionSize;
  if (percentile <= 0.1) return 1;
  if (percentile <= 0.25) return 4;
  if (percentile <= 0.5) return 8;
  return 12;
}
