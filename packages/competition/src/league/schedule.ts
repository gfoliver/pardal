import type { Fixture } from "./Fixture.js";

/** A fixture placed on an integer day-of-season, tagged for a competition. */
export interface DatedFixture {
  readonly competitionId: string;
  /** Stable index into the source fixtures array → feeds matchSeed(). */
  readonly fixtureIndex: number;
  readonly round: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** Integer day-of-season (0-based). */
  readonly day: number;
}

export interface ScheduleConfig {
  readonly competitionId: string;
  /** Day-of-season the first round is played on. */
  readonly firstDay: number;
  /** Days between consecutive rounds (e.g. 7 for weekly). */
  readonly daysPerRound: number;
}

/**
 * Place round-robin fixtures on the calendar: round R → day
 * firstDay + (R-1)*daysPerRound. Because a round-robin round has each team
 * playing at most once, mapping whole rounds to days can never double-book a
 * team WITHIN one competition. Cross-competition congestion is checked when the
 * career merges several competitions' dated fixtures (see hasSameDayConflict).
 */
export function assignDates(fixtures: readonly Fixture[], config: ScheduleConfig): DatedFixture[] {
  return fixtures.map((f, i) => ({
    competitionId: config.competitionId,
    fixtureIndex: i,
    round: f.round,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    day: config.firstDay + (f.round - 1) * config.daysPerRound,
  }));
}

/** True if any team is scheduled to play more than once on the same day. */
export function hasSameDayConflict(dated: readonly DatedFixture[]): boolean {
  const seen = new Map<number, Set<string>>();
  for (const f of dated) {
    let day = seen.get(f.day);
    if (!day) seen.set(f.day, (day = new Set()));
    if (day.has(f.homeTeamId) || day.has(f.awayTeamId)) return true;
    day.add(f.homeTeamId);
    day.add(f.awayTeamId);
  }
  return false;
}

/** All distinct days that have at least one fixture, ascending. */
export function matchDays(dated: readonly DatedFixture[]): number[] {
  return [...new Set(dated.map((f) => f.day))].sort((a, b) => a - b);
}
