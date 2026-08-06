import { describe, expect, it } from "vitest";
import { divisionTarget, seasonBudget } from "@fut/career";

/**
 * What a division is worth, and what a board expects of a club inside it.
 *
 * Both were tier-blind, and the measurements say what that cost. Over two simulated seasons on the
 * forty-club dataset, of eight relegated clubs TWO came out with a bigger budget than they had in the
 * division above and one was flat — because the budget's anchor is the payroll and relegation never
 * touched the payroll. And the second tier was relatively RICHER: budgets 1.6× apart between the tiers
 * against player values 3.2× apart, so a Série B club could afford 10.4 of its own division's median
 * players against a Série A club's 7.3.
 */

const PAYROLL = 100_000_000;
/** Same club id throughout, so the per-club appetite factor is held constant and only the tier moves. */
const CLUB = "alpha";
const budget = (tier: number | undefined, opts: { finalPosition?: number; teamsInLeague?: number } = {}) =>
  seasonBudget(1234, CLUB, PAYROLL, { ...opts, tier });

describe("what a division is worth", () => {
  it("pays a second-tier club less than a first-tier club that finished in the same place", () => {
    const first = budget(1, { finalPosition: 1, teamsInLeague: 20 });
    const second = budget(2, { finalPosition: 1, teamsInLeague: 20 });
    // Winning Série B used to pay exactly what winning Série A pays, because the prize was a function
    // of position and division size and both divisions hold twenty clubs.
    expect(second).toBeLessThan(first);
  });

  it("costs a club money to be relegated, holding its payroll and finish constant", () => {
    // The measured defect stated as a test: a relegated club keeps its wage bill, so if the tier does
    // not enter the budget at all then nothing pushes its budget down.
    expect(budget(2, { finalPosition: 18, teamsInLeague: 20 })).toBeLessThan(
      budget(1, { finalPosition: 18, teamsInLeague: 20 }),
    );
  });

  it("never leaves a club unable to pay the wages it already owes", () => {
    // Why the tier scales the SLACK and the PRIZE and never the payroll: a budget below the payroll is
    // a debt the manager cannot see the cause of. True at every tier, including one deeper than the
    // table knows about.
    for (const tier of [1, 2, 3, 7, undefined]) {
      expect(budget(tier), `tier ${tier}`).toBeGreaterThanOrEqual(PAYROLL);
    }
  });

  it("treats a division below the table like the lowest one it knows, not like nothing", () => {
    // A third tier with no money at all could not field a squad.
    expect(budget(3)).toBe(budget(2));
    expect(budget(9)).toBe(budget(2));
  });

  it("leaves a single-division career exactly where it was", () => {
    // Tier 1 is the top flight and gets the full share, so a career with one league is untouched by
    // any of this — and an absent tier is treated as the top flight for the same reason.
    expect(budget(1, { finalPosition: 3, teamsInLeague: 20 })).toBe(budget(undefined, { finalPosition: 3, teamsInLeague: 20 }));
  });

  it("still pays more for finishing higher", () => {
    for (const tier of [1, 2]) {
      expect(budget(tier, { finalPosition: 1, teamsInLeague: 20 }), `tier ${tier}`).toBeGreaterThan(
        budget(tier, { finalPosition: 20, teamsInLeague: 20 }),
      );
    }
  });
});

describe("what a board expects", () => {
  /**
   * The target used to come from absolute reputation, which is derived from market value across the
   * whole world — so in a two-division dataset every second-tier club fell in the bottom band and all
   * twenty were told to finish twelfth, the champion-elect and the relegation candidate alike.
   */
  it("expects the richest clubs in a division to win it, whichever division that is", () => {
    expect(divisionTarget(0, 20)).toBe(1);
    expect(divisionTarget(1, 20)).toBe(1);
  });

  it("asks less of a club the further down its own division's means it sits", () => {
    const targets = [0, 4, 9, 19].map((rank) => divisionTarget(rank, 20));
    expect(targets).toEqual([...targets].sort((a, b) => a - b));
    expect(targets[0]).toBeLessThan(targets[3]!);
  });

  it("scales with the size of the division rather than assuming twenty", () => {
    // Top of a ten-club division is still expected to win it; the middle is not.
    expect(divisionTarget(0, 10)).toBe(1);
    expect(divisionTarget(9, 10)).toBe(12);
    // A four-club league has no "top tenth", so nobody is handed the title as an expectation.
    expect(divisionTarget(0, 4)).toBe(4);
  });

  it("answers for a division with no clubs in it rather than dividing by zero", () => {
    expect(divisionTarget(0, 0)).toBe(1);
  });
});
