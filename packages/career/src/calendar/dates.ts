import type { SeasonDate } from "../time.js";

/**
 * Real Gregorian calendar mapping. Career time stays a deterministic integer
 * day index (SeasonDate), but every save carries a fixed `startEpochDay`
 * anchor, so a SeasonDate maps to a REAL civil date (e.g. 2026-08-08) for
 * display and for future per-competition schedules. Pure integer arithmetic —
 * no Date.now, so determinism holds. Epoch day 0 = 1970-01-01.
 */
export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number; // 1–31
}

/** Days per season on the real calendar (a season occupies its own year). */
export const SEASON_YEAR_DAYS = 365;

/** Default career start: Saturday 2026-08-08. */
export const DEFAULT_START = { year: 2026, month: 8, day: 8 };

/** Civil (y,m,d) → days since 1970-01-01 (Howard Hinnant's algorithm). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Days since 1970-01-01 → civil (y,m,d). */
export function civilFromDays(z0: number): CivilDate {
  const z = z0 + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** Weekday for an epoch day: 0 = Sunday … 6 = Saturday. */
export function weekday(epochDay: number): number {
  return (((epochDay + 4) % 7) + 7) % 7;
}

/** Epoch day for a SeasonDate given the career's start anchor. */
export function epochDayOf(startEpochDay: number, d: SeasonDate): number {
  return startEpochDay + d.season * SEASON_YEAR_DAYS + d.dayOfSeason;
}

/** Real civil date for a SeasonDate. */
export function civilOf(startEpochDay: number, d: SeasonDate): CivilDate {
  return civilFromDays(epochDayOf(startEpochDay, d));
}
