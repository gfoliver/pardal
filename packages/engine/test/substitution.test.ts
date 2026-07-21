import { describe, expect, it } from "vitest";
import { SubstitutionRules } from "@fut/domain";
import { SubstitutionManager } from "@fut/engine";

describe("SubstitutionManager (injected rules)", () => {
  it("enforces the maximum number of substitutions", () => {
    const mgr = new SubstitutionManager(new SubstitutionRules(5, 5, false));
    for (let i = 0; i < 5; i++) {
      expect(mgr.canSubstitute("t", 10 + i, false)).toBe(true);
      mgr.record("t", 10 + i, false);
    }
    expect(mgr.canSubstitute("t", 80, false)).toBe(false);
  });

  it("enforces the maximum number of windows (Brasileirão 5/3)", () => {
    const mgr = new SubstitutionManager(SubstitutionRules.brasileirao());
    // Three distinct minutes = three windows.
    for (const minute of [30, 60, 75]) {
      expect(mgr.canSubstitute("t", minute, false)).toBe(true);
      mgr.record("t", minute, false);
    }
    // A fourth distinct minute would open a fourth window — denied.
    expect(mgr.canSubstitute("t", 85, false)).toBe(false);
    // But another sub within an already-open window is allowed.
    expect(mgr.canSubstitute("t", 75, false)).toBe(true);
  });

  it("does not consume a window at half-time when exempt", () => {
    const mgr = new SubstitutionManager(SubstitutionRules.brasileirao());
    mgr.record("t", 45, true); // half-time, exempt
    expect(mgr.windowsUsed("t")).toBe(0);
    // Still three in-play windows available.
    for (const minute of [50, 65, 80]) {
      expect(mgr.canSubstitute("t", minute, false)).toBe(true);
      mgr.record("t", minute, false);
    }
    expect(mgr.windowsUsed("t")).toBe(3);
  });
});
