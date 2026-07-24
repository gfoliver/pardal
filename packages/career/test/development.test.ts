import { describe, expect, it } from "vitest";
import { SeededRandom } from "@fut/engine";
import { newPlayerDev, progressSeason } from "@fut/career";

describe("progressSeason (development/aging)", () => {
  it("grows a young high-potential player's ability toward PA", () => {
    const dev = newPlayerDev("p", 100, 170, 18);
    const before = dev.currentAbility;
    progressSeason(dev, new SeededRandom(1), false);
    expect(dev.currentAbility).toBeGreaterThan(before);
    expect(dev.currentAbility).toBeLessThanOrEqual(dev.potentialAbility);
    expect(dev.ageAtSeasonStart).toBe(19);
    // Overall shifts up → positive attribute deltas.
    expect((dev.attributeDeltas.finishing ?? 0)).toBeGreaterThan(0);
  });

  it("declines an old player's ability and legs", () => {
    const dev = newPlayerDev("p", 160, 160, 34);
    const before = dev.currentAbility;
    progressSeason(dev, new SeededRandom(2), false);
    expect(dev.currentAbility).toBeLessThan(before);
    expect((dev.attributeDeltas.pace ?? 0)).toBeLessThan(0);
  });

  it("never grows a young player past PA", () => {
    const dev = newPlayerDev("p", 168, 170, 19);
    for (let i = 0; i < 10; i++) progressSeason(dev, new SeededRandom(i + 1), false);
    expect(dev.currentAbility).toBeLessThanOrEqual(170);
  });

  it("is deterministic for a given seed", () => {
    const a = newPlayerDev("p", 120, 180, 20);
    const b = newPlayerDev("p", 120, 180, 20);
    progressSeason(a, new SeededRandom(7), false);
    progressSeason(b, new SeededRandom(7), false);
    expect(a).toEqual(b);
  });
});
