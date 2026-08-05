import { describe, expect, it } from "vitest";
import { ballIsOurs } from "../src/components/career/NegotiationThread";

/**
 * Whose move it is, which decides whether the negotiation card shows a status badge at all.
 *
 * A truth table over (stage, which side we are on), and the reason it is worth a test rather than an
 * inline expression: getting it backwards hides the status in exactly the cases that need one, and shows
 * "awaiting a response" next to the buttons that answer it in exactly the cases that do not. Neither
 * failure looks like a bug in a screenshot.
 */

const at = (stage: Parameters<typeof ballIsOurs>[0]["stage"], weAreBuying: boolean) => ballIsOurs({ stage, weAreBuying });

describe("whose move is it", () => {
  it("is ours when they have bid for one of our players", () => {
    // The received-offers case: Accept / Ask for more / Refuse are right there, so the badge would only
    // be repeating them.
    expect(at("offered", false)).toBe(true);
  });

  it("is theirs when WE have bid and they have not answered", () => {
    // Nothing on this card is actionable except withdrawing, so "awaiting a response" is the only thing
    // that says what is happening.
    expect(at("offered", true)).toBe(false);
  });

  it("is ours when they counter a bid of ours", () => {
    expect(at("countered", true)).toBe(true);
  });

  it("is theirs when we have named a price for one of ours", () => {
    // We asked; the ball is in their court until they answer.
    expect(at("countered", false)).toBe(false);
  });

  it("is nobody's once the deal is settled, whichever side we were on", () => {
    for (const stage of ["feeAgreed", "personalTerms", "completed", "rejected", "expired", "withdrawn"] as const) {
      expect(at(stage, true)).toBe(false);
      expect(at(stage, false)).toBe(false);
    }
  });
});
