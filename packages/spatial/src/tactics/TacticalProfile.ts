import { mentalityToAttackBias, MarkingScheme, type TeamInstructions } from "@fut/domain";
import { clamp } from "../math.js";

/**
 * Camada Tática — the tactic never controls players directly; it only MODIFIES
 * the weights the mathematical layers use. This value object turns a team's
 * `TeamInstructions` (mentality, pressing, line height, width, tempo,
 * directness, marking) into the normalised coefficients the positioning,
 * objective and utility layers read.
 */
export interface TacticalProfile {
  /** −1 (very defensive) … +1 (very attacking). */
  attackBias: number;
  /** 0 (deep block) … 1 (high line). */
  lineHeight: number;
  /** 0 (contain) … 1 (aggressive press). */
  pressing: number;
  /** 0 (narrow) … 1 (very wide). */
  width: number;
  /** 0 (patient) … 1 (direct/vertical). */
  directness: number;
  /** 0 (slow build-up) … 1 (high tempo). */
  tempo: number;
  /** Man-marking vs zonal. */
  manMarking: boolean;
}

export function buildProfile(inst: TeamInstructions): TacticalProfile {
  return {
    attackBias: mentalityToAttackBias(inst.mentality),
    lineHeight: clamp(inst.lineHeight, 0, 1),
    pressing: clamp(inst.pressing, 0, 1),
    width: clamp(inst.width, 0, 1),
    directness: clamp(inst.directness, 0, 1),
    tempo: clamp(inst.tempo, 0, 1),
    manMarking: inst.markingScheme === MarkingScheme.Man,
  };
}
