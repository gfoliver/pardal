/**
 * Career time is an INTEGER day index within a season — not a Gregorian date.
 * This keeps the whole world deterministic and free of timezone/leap-year
 * noise; the UI formats a `SeasonDate` into a display date via Intl.
 */
export interface SeasonDate {
  /** 0-based season number since the career started. */
  readonly season: number;
  /** 0-based day within the season (0 … Calendar.totalDays-1). */
  readonly dayOfSeason: number;
}

/** Money is always an integer (currency units) — never a float, to avoid drift. */
export type Money = number;

/** Compare two season dates chronologically (<0, 0, >0). */
export function compareDates(a: SeasonDate, b: SeasonDate): number {
  return a.season - b.season || a.dayOfSeason - b.dayOfSeason;
}

/** True when `a` is on or before `b`. */
export function onOrBefore(a: SeasonDate, b: SeasonDate): boolean {
  return compareDates(a, b) <= 0;
}
