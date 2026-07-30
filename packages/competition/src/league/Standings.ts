/** A single goal within a fixture (for scorer/assist aggregation). */
export interface GoalRecord {
  readonly teamId: string;
  readonly scorerId: string;
  readonly assistId?: string;
  readonly penalty?: boolean;
  /**
   * Match minute the goal was scored. Optional because careers saved before it
   * was recorded have goals without one — the UI simply omits the minute there.
   */
  readonly minute?: number;
}

/** One player's involvement in a fixture (appearance + minutes + match rating).
 *  Optional on a result: only present once the sim records lineups. Goals and
 *  assists are NOT duplicated here — they derive from `goals[]`. */
export interface PlayerMatchLine {
  readonly playerId: string;
  readonly teamId: string;
  readonly minutes: number;
  /** Match rating on a 0–10 scale, one decimal. */
  readonly rating: number;
}

/**
 * How much a result is to be trusted. Absent means `"confirmed"` — careers saved
 * before this existed hold results that were, by construction, final.
 *
 * - `confirmed`  — settled; the only status the official table counts.
 * - `provisional` — computed but not yet independently corroborated.
 * - `void`       — repudiated. Contributes NOTHING, which is not the same as a 0-0.
 * - `forfeit`    — awarded rather than played.
 */
export type FixtureStatus = "confirmed" | "provisional" | "void" | "forfeit";

/** A played fixture with its final score (and goal breakdown when available). */
export interface FixtureResult {
  readonly round: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly goals?: readonly GoalRecord[];
  /** Per-player appearance lines, when the source recorded lineups. */
  readonly players?: readonly PlayerMatchLine[];
  /**
   * Stable identity for the fixture this result settles.
   *
   * Optional because saved careers predate it, and because in a league
   * (round, home, away) already identifies a fixture — {@link fixtureKey} falls
   * back to that. It has to be set explicitly wherever that triple ISN'T unique:
   * a knockout tie replayed to break a draw is the same teams in the same round,
   * and must not collapse into one result.
   */
  readonly fixtureId?: string;
  /** See {@link FixtureStatus}. Absent = `"confirmed"`. */
  readonly status?: FixtureStatus;
}

/** The identity a result is deduplicated on. */
export const fixtureKey = (r: FixtureResult): string =>
  r.fixtureId ?? `${r.round}:${r.homeTeamId}:${r.awayTeamId}`;

/** A result's effective status. */
export const statusOf = (r: FixtureResult): FixtureStatus => r.status ?? "confirmed";

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
 * Final tiebreak for every ordering in this package: compare by UTF-16 codepoint.
 *
 * NOT `localeCompare`, which was the bug this replaces. ICU collation depends on the
 * runtime's locale data and default locale, so Node, Chrome, Safari and a Worker can
 * legitimately disagree about the order of two ids differing by case, accent or
 * punctuation — `"são-paulo"` against `"Santos"`. Two clients holding IDENTICAL
 * results could then disagree about the champion, the relegation places or a
 * knockout seeding. Human-friendly, locale-aware ordering belongs in the UI layer,
 * where nothing depends on everyone agreeing.
 */
export const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface StandingsOptions {
  /**
   * Which statuses count toward the table. Defaults to `["confirmed"]` — the
   * official table. Pass `["confirmed", "provisional"]` for a "table so far" view
   * that shows uncorroborated results, but never decide anything irreversible
   * (a title, a relegation, a knockout seeding) off that.
   */
  readonly include?: readonly FixtureStatus[];
}

/**
 * Compute the league table from played fixtures. Sorted by points, then goal
 * difference, then goals for, then team id (a stable, deterministic tiebreak).
 *
 * Results are DEDUPLICATED on {@link fixtureKey}, last one winning. Without that,
 * the same fixture appearing twice silently doubles both teams' points — and the
 * multiplayer ingest path will legitimately re-record a result (a re-attestation, a
 * retry, a correction), so "it can't happen" is not true here. Last-write-wins is
 * the defined rule: a correction supersedes what it corrects.
 */
export function computeStandings(
  teamIds: readonly string[],
  results: readonly FixtureResult[],
  options: StandingsOptions = {},
): StandingRow[] {
  const include = options.include ?? (["confirmed"] as const);
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

  // Dedup BEFORE filtering by status, not after: a later `void` has to be able to
  // supersede an earlier `provisional` for the same fixture. Filtering first would
  // drop the void and leave the superseded result standing.
  const latest = new Map<string, FixtureResult>();
  for (const r of results) latest.set(fixtureKey(r), r);

  for (const r of latest.values()) {
    if (!include.includes(statusOf(r))) continue;
    const home = rows.get(r.homeTeamId);
    const away = rows.get(r.awayTeamId);
    // A result naming a team outside this competition is silently skipped so one
    // bad row can't break a whole table. `validateResults` is where such a row is
    // meant to be caught and reported — call it at ingest, not here.
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
      byCodepoint(a.teamId, b.teamId),
  );
}

/** What can be wrong with a submitted result. */
export type ResultProblem =
  /** Names a team that is not in this competition. */
  | "unknownTeam"
  /** Home and away are the same team. */
  | "sameTeam"
  /** A negative or non-integer score. */
  | "badScore"
  /** Another result already settles this fixture (see {@link fixtureKey}). */
  | "duplicate";

export interface ResultIssue {
  readonly key: string;
  readonly index: number;
  readonly problem: ResultProblem;
  readonly detail: string;
}

/**
 * Check results before they are trusted. `computeStandings` deliberately skips a
 * malformed row rather than throwing mid-table, which means a bad row is INVISIBLE
 * there — so anything ingesting results from outside this process (the multiplayer
 * server accepting an attestation, an imported save) should run this first and act
 * on what it returns.
 *
 * A `duplicate` is reported, not rejected: last-write-wins is legitimate for a
 * correction. It is surfaced so the caller can decide which it is.
 */
export function validateResults(
  teamIds: readonly string[],
  results: readonly FixtureResult[],
): ResultIssue[] {
  const known = new Set(teamIds);
  const seen = new Set<string>();
  const issues: ResultIssue[] = [];
  results.forEach((r, index) => {
    const key = fixtureKey(r);
    const add = (problem: ResultProblem, detail: string): void =>
      void issues.push({ key, index, problem, detail });
    for (const id of [r.homeTeamId, r.awayTeamId]) {
      if (!known.has(id)) add("unknownTeam", `"${id}" is not in this competition`);
    }
    if (r.homeTeamId === r.awayTeamId) add("sameTeam", `"${r.homeTeamId}" against itself`);
    for (const [side, score] of [
      ["home", r.homeScore],
      ["away", r.awayScore],
    ] as const) {
      if (!Number.isInteger(score) || score < 0) add("badScore", `${side} score ${score}`);
    }
    if (seen.has(key)) add("duplicate", `a result for ${key} was already given`);
    seen.add(key);
  });
  return issues;
}
