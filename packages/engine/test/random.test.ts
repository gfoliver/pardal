import { describe, expect, it } from "vitest";
import { SeededRandom } from "@fut/engine";

describe("SeededRandom", () => {
  it("is deterministic for a given seed", () => {
    const a = new SeededRandom(123);
    const b = new SeededRandom(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("returns values in [0, 1)", () => {
    const r = new SeededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("weighted() respects zero weights", () => {
    const r = new SeededRandom(9);
    for (let i = 0; i < 50; i++) {
      const pick = r.weighted([
        { item: "a", weight: 0 },
        { item: "b", weight: 1 },
        { item: "c", weight: 0 },
      ]);
      expect(pick).toBe("b");
    }
  });
});
