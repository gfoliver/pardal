import { describe, expect, it } from "vitest";
import { MarkingScheme, Mentality } from "@fut/domain";
import { matchPreset, TACTIC_PRESETS, type TacticPresetKey } from "@fut/career";
import type { StoredInstructions } from "@fut/career";

const BALANCED = TACTIC_PRESETS.find((p) => p.key === "balanced")!;

describe("tactic presets", () => {
  it("matchPreset recognises every preset's own values, exactly", () => {
    for (const preset of TACTIC_PRESETS) {
      expect(matchPreset(preset.mentality, preset.instructions)).toBe(preset.key);
    }
  });

  it("tolerates float drift within the epsilon, but not beyond it", () => {
    const nudgedIn: StoredInstructions = { ...BALANCED.instructions, tempo: BALANCED.instructions.tempo + 0.01 };
    expect(matchPreset(BALANCED.mentality, nudgedIn)).toBe("balanced");

    const nudgedOut: StoredInstructions = { ...BALANCED.instructions, tempo: BALANCED.instructions.tempo + 0.05 };
    expect(matchPreset(BALANCED.mentality, nudgedOut)).toBeUndefined();
  });

  it("a different mentality alone breaks the match, even with identical sliders", () => {
    expect(matchPreset(Mentality.Attacking, BALANCED.instructions)).toBeUndefined();
  });

  it("a different marking scheme alone breaks the match", () => {
    const zonalToMan: StoredInstructions = { ...BALANCED.instructions, markingScheme: MarkingScheme.Man };
    expect(matchPreset(BALANCED.mentality, zonalToMan)).toBeUndefined();
  });

  it("returns undefined (Custom) for values that match no preset", () => {
    const custom: StoredInstructions = { tempo: 0.33, pressing: 0.71, lineHeight: 0.12, width: 0.9, directness: 0.44, markingScheme: MarkingScheme.Man };
    expect(matchPreset(Mentality.Balanced, custom)).toBeUndefined();
  });

  it("every preset key is covered, and each is a distinct shape from \"balanced\" in at least two profile inputs", () => {
    const keys: TacticPresetKey[] = ["highPress", "possession", "counter", "lowBlock", "balanced", "direct"];
    expect(TACTIC_PRESETS.map((p) => p.key).sort()).toEqual([...keys].sort());

    for (const preset of TACTIC_PRESETS) {
      if (preset.key === "balanced") continue;
      const diffs = [
        preset.mentality !== BALANCED.mentality,
        Math.abs(preset.instructions.tempo - BALANCED.instructions.tempo) > 0.05,
        Math.abs(preset.instructions.pressing - BALANCED.instructions.pressing) > 0.05,
        Math.abs(preset.instructions.lineHeight - BALANCED.instructions.lineHeight) > 0.05,
        Math.abs(preset.instructions.width - BALANCED.instructions.width) > 0.05,
        Math.abs(preset.instructions.directness - BALANCED.instructions.directness) > 0.05,
        preset.instructions.markingScheme !== BALANCED.instructions.markingScheme,
      ].filter(Boolean).length;
      expect(diffs).toBeGreaterThanOrEqual(2);
    }
  });

  it("every preset's sliders sit on the 0.05 grid (stable epsilon comparisons)", () => {
    for (const preset of TACTIC_PRESETS) {
      for (const v of [preset.instructions.tempo, preset.instructions.pressing, preset.instructions.lineHeight, preset.instructions.width, preset.instructions.directness]) {
        expect(Math.round(v / 0.05)).toBeCloseTo(v / 0.05, 6);
      }
    }
  });
});
