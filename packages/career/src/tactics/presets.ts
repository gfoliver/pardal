import { MarkingScheme, Mentality } from "@fut/domain";
import type { StoredInstructions } from "./StoredTactics.js";

/**
 * Named bundles of mentality + the five sliders + marking, each a genuine
 * trade-off against the profile the engine actually builds from them
 * (@fut/spatial's TacticalProfile: attack bias from mentality, a line-height
 * cap of 12+lineHeight·34, a block length of 0.78-pressing·0.14, a width
 * spread of 0.5+width, and a risk term of 0.5+bias·0.3+directness·0.3). Values
 * sit on a 0.05 grid so `matchPreset`'s epsilon-compare is stable.
 */
export type TacticPresetKey = "highPress" | "possession" | "counter" | "lowBlock" | "balanced" | "direct";

export interface TacticPreset {
  readonly key: TacticPresetKey;
  readonly mentality: Mentality;
  readonly instructions: StoredInstructions;
}

export const TACTIC_PRESETS: readonly TacticPreset[] = [
  {
    // Wins the ball high up the pitch, but the high defensive line and
    // compact block leave space in behind if the press is beaten.
    key: "highPress",
    mentality: Mentality.Attacking,
    instructions: { tempo: 0.7, pressing: 0.9, lineHeight: 0.85, width: 0.55, directness: 0.5, markingScheme: MarkingScheme.Man },
  },
  {
    // Low risk, methodical build-up; slow to progress and can be sat on by a
    // patient opponent since it presses only moderately.
    key: "possession",
    mentality: Mentality.Balanced,
    instructions: { tempo: 0.3, pressing: 0.6, lineHeight: 0.65, width: 0.65, directness: 0.2, markingScheme: MarkingScheme.Zonal },
  },
  {
    // Deep and safe out of possession, quick and direct once the ball is won —
    // the low attack bias caps how many chances it manufactures overall.
    key: "counter",
    mentality: Mentality.Defensive,
    instructions: { tempo: 0.8, pressing: 0.35, lineHeight: 0.3, width: 0.45, directness: 0.85, markingScheme: MarkingScheme.Zonal },
  },
  {
    // Hardest shape to break down; almost no attacking threat of its own.
    key: "lowBlock",
    mentality: Mentality.VeryDefensive,
    instructions: { tempo: 0.4, pressing: 0.25, lineHeight: 0.15, width: 0.35, directness: 0.6, markingScheme: MarkingScheme.Zonal },
  },
  {
    // The neutral reference: no lever pulled either way.
    key: "balanced",
    mentality: Mentality.Balanced,
    instructions: { tempo: 0.5, pressing: 0.5, lineHeight: 0.5, width: 0.5, directness: 0.5, markingScheme: MarkingScheme.Zonal },
  },
  {
    // High risk-term: creates and concedes chances in roughly equal measure.
    key: "direct",
    mentality: Mentality.Attacking,
    instructions: { tempo: 0.75, pressing: 0.45, lineHeight: 0.5, width: 0.7, directness: 0.95, markingScheme: MarkingScheme.Zonal },
  },
];

const EPSILON = 0.011;
const closeEnough = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;

/** Which preset (if any) the current mentality + sliders exactly match. */
export function matchPreset(mentality: Mentality, instructions: StoredInstructions): TacticPresetKey | undefined {
  const found = TACTIC_PRESETS.find(
    (p) =>
      p.mentality === mentality &&
      p.instructions.markingScheme === instructions.markingScheme &&
      closeEnough(p.instructions.tempo, instructions.tempo) &&
      closeEnough(p.instructions.pressing, instructions.pressing) &&
      closeEnough(p.instructions.lineHeight, instructions.lineHeight) &&
      closeEnough(p.instructions.width, instructions.width) &&
      closeEnough(p.instructions.directness, instructions.directness),
  );
  return found?.key;
}
