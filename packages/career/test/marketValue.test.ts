import { describe, expect, it } from "vitest";
import { ageCurve, marketValue } from "@fut/career";

describe("marketValue", () => {
  const base = { age: 24, currentAbility: 120, potentialAbility: 120 };

  it("is monotonically increasing in overall (all else equal)", () => {
    let prev = -1;
    for (let overall = 40; overall <= 95; overall += 5) {
      const v = marketValue({ ...base, overall });
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it("peaks in the mid-20s and declines with age", () => {
    const young = marketValue({ overall: 80, age: 18, currentAbility: 120, potentialAbility: 120 });
    const peak = marketValue({ overall: 80, age: 25, currentAbility: 120, potentialAbility: 120 });
    const old = marketValue({ overall: 80, age: 34, currentAbility: 120, potentialAbility: 120 });
    expect(peak).toBeGreaterThan(young);
    expect(peak).toBeGreaterThan(old);
    expect(old).toBeLessThan(young);
  });

  it("adds a premium for unfulfilled potential", () => {
    const flat = marketValue({ overall: 70, age: 19, currentAbility: 110, potentialAbility: 110 });
    const talented = marketValue({ overall: 70, age: 19, currentAbility: 110, potentialAbility: 180 });
    expect(talented).toBeGreaterThan(flat);
  });

  it("ageCurve peaks at 26-27", () => {
    expect(ageCurve(26)).toBeCloseTo(1.0, 2);
    expect(ageCurve(20)).toBeLessThan(ageCurve(26));
    expect(ageCurve(33)).toBeLessThan(ageCurve(28));
  });
});
