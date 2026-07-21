/** A single goal within a fixture (for scorer/assist aggregation). */
export interface GoalRecord {
  readonly teamId: string;
  readonly scorerId: string;
  readonly assistId?: string;
  readonly penalty?: boolean;
}

/** A played fixture with its final score (and goal breakdown when available). */
export interface FixtureResult {
  readonly round: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly goals?: readonly GoalRecord[];
}

/** One row of the league table. */
export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;

/**
 * Compute the league table from played fixtures. Sorted by points, then goal
 * difference, then goals for, then team id (a stable, deterministic tiebreak).
 */
export function computeStandings(
  teamIds: readonly string[],
  results: readonly FixtureResult[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const teamId of teamIds) {
    rows.set(teamId, {
      teamId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const r of results) {
    const home = rows.get(r.homeTeamId);
    const away = rows.get(r.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += r.homeScore;
    home.goalsAgainst += r.awayScore;
    away.goalsFor += r.awayScore;
    away.goalsAgainst += r.homeScore;

    if (r.homeScore > r.awayScore) {
      home.won++;
      away.lost++;
      home.points += POINTS_WIN;
    } else if (r.homeScore < r.awayScore) {
      away.won++;
      home.lost++;
      away.points += POINTS_WIN;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId),
  );
}
