import { describe, expect, it } from "vitest";
import { splitDuration } from "../src/lib/format";

/**
 * How long is a contract, in the units a manager reads?
 *
 * The bug this guards was pure arithmetic with a very visible effect. Contracts run in SEASONS —
 * `state.totalDays` days, 280 in the Brasileirão — and expiry, ageing and renewals are all counted
 * in them. The squad screen divided the remaining days by a Gregorian 365, so every deal displayed
 * about a quarter shorter than the one that had just been negotiated. Agreeing four years produced
 * "3a 0m" on the very next screen, which is indistinguishable from the term having been ignored.
 */

/** The real Brasileirão season: 38 rounds of fixtures plus a fortnight. */
const SEASON = 280;

describe("a span of days in the game's own years", () => {
  it("reads a whole season as one year, not nine months", () => {
    expect(splitDuration(SEASON, SEASON)).toEqual({ years: 1, months: 0, days: 0 });
    // What it used to say, and the reason a contract looked wrong on sight.
    expect(splitDuration(SEASON, 365)).toEqual({ years: 0, months: 9, days: 0 });
  });

  it("counts every agreed term exactly", () => {
    for (const years of [1, 2, 3, 4, 5]) {
      expect(splitDuration(years * SEASON, SEASON), `${years} seasons`).toEqual({ years, months: 0, days: 0 });
    }
  });

  it("splits a part-season into months of that same year", () => {
    // Half a season is six months, whatever the season's length happens to be.
    expect(splitDuration(SEASON / 2, SEASON)).toEqual({ years: 0, months: 6, days: 0 });
    expect(splitDuration(SEASON + SEASON / 4, SEASON)).toEqual({ years: 1, months: 3, days: 0 });
  });

  it("adds up: the parts never exceed the whole", () => {
    for (let d = 0; d <= 5 * SEASON; d += 7) {
      const { years, months } = splitDuration(d, SEASON);
      expect(years * SEASON + months * (SEASON / 12), `${d} days`).toBeLessThanOrEqual(d + SEASON / 24);
    }
  });

  it("keeps days as the unit under a month, where a lapsing deal needs precision", () => {
    expect(splitDuration(12, SEASON)).toEqual({ years: 0, months: 0, days: 12 });
    expect(splitDuration(0, SEASON)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("says a year rather than twelve months", () => {
    // Rounding up to a twelfth-of-a-year boundary must not produce "1a 12m".
    expect(splitDuration(SEASON - 1, SEASON)).toEqual({ years: 1, months: 0, days: 0 });
    expect(splitDuration(2 * SEASON - 2, SEASON)).toEqual({ years: 2, months: 0, days: 0 });
  });

  it("never returns a negative span for a lapsed deal", () => {
    expect(splitDuration(-40, SEASON)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("falls back to a calendar year when nobody says otherwise", () => {
    expect(splitDuration(365)).toEqual({ years: 1, months: 0, days: 0 });
    expect(splitDuration(0, 0)).toEqual({ years: 0, months: 0, days: 0 });
  });
});
