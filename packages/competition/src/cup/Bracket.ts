/** A single knockout pairing. Two-legged aggregation is the caller's job
 *  (via TieContext + MatchRules.knockout); the bracket only pairs teams. */
export interface CupTie {
  readonly round: number;
  readonly tieIndex: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

export interface CupRound {
  readonly round: number;
  readonly ties: CupTie[];
  /** Teams that advance without playing (odd count → last team gets a bye). */
  readonly byes: string[];
}

/**
 * Pair an ORDERED list of teams into knockout ties (sequential pairs; an odd
 * team out gets a bye). Deterministic on input order — pass a seeded order for
 * a random draw. Later rounds are built with the same function from the
 * winners once ties are decided.
 */
export function pairRound(teamIds: readonly string[], round: number): CupRound {
  const ties: CupTie[] = [];
  const byes: string[] = [];
  let tieIndex = 0;
  for (let i = 0; i + 1 < teamIds.length; i += 2) {
    ties.push({ round, tieIndex: tieIndex++, homeTeamId: teamIds[i]!, awayTeamId: teamIds[i + 1]! });
  }
  if (teamIds.length % 2 === 1) byes.push(teamIds[teamIds.length - 1]!);
  return { round, ties, byes };
}

/**
 * Number of knockout rounds needed to go from `n` entrants to a winner.
 *
 * Counted by doubling rather than `Math.ceil(Math.log2(n))`. `log2` is
 * implementation-approximated, so an engine returning 3.0000000000000004 for
 * `log2(8)` would say a straight 8-team bracket needs FOUR rounds — and two clients
 * disagreeing about the size of a bracket is not a rounding difference, it is two
 * different tournaments. Integer arithmetic has no such opinion.
 */
export function roundsNeeded(n: number): number {
  if (n <= 1) return 0;
  let rounds = 0;
  for (let capacity = 1; capacity < n; capacity *= 2) rounds++;
  return rounds;
}
