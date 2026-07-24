/** What the board expects this season and how happy they currently are. */
export interface BoardObjectives {
  /** Target final league position (1 = win the title). */
  readonly leaguePositionTarget: number;
  /** Optional cup expectation (round to reach), by competitionId. */
  readonly cupTargets: Readonly<Record<string, number>>;
  /** Board confidence 0..100 (drives sack risk). */
  confidence: number;
}

export function newObjectives(leaguePositionTarget: number): BoardObjectives {
  return { leaguePositionTarget, cupTargets: {}, confidence: 60 };
}
