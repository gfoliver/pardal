/** A scheduled match in a league round. */
export interface Fixture {
  readonly round: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
}

const BYE = "__bye__";

/**
 * Round-robin fixture generation (circle method). With `doubleRoundRobin` each
 * pairing is played twice with home/away reversed (a full league season).
 */
export function generateFixtures(
  teamIds: readonly string[],
  options: { doubleRoundRobin?: boolean } = {},
): Fixture[] {
  const double = options.doubleRoundRobin ?? true;
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(BYE);

  const n = ids.length;
  const roundsPerLeg = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];

  let arr = ids.slice();
  for (let r = 0; r < roundsPerLeg; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      // Alternate home/away by round for fairness.
      const [home, away] = r % 2 === 0 ? [a, b] : [b, a];
      fixtures.push({ round: r + 1, homeTeamId: home, awayTeamId: away });
    }
    // Rotate all but the first element.
    arr = [arr[0]!, arr[n - 1]!, ...arr.slice(1, n - 1)];
  }

  if (double) {
    const firstLeg = fixtures.slice();
    for (const f of firstLeg) {
      fixtures.push({
        round: f.round + roundsPerLeg,
        homeTeamId: f.awayTeamId,
        awayTeamId: f.homeTeamId,
      });
    }
  }

  return fixtures;
}
