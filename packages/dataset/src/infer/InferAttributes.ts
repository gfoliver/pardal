import { type AttrName, Position } from "@fut/domain";
import { attr, type Attribute } from "./Attribute.js";
import { shapeForPosition } from "./positionShape.js";
import { applyPerturbations, targetOverall } from "./formulas.js";
import type { NormalizedPlayer } from "../normalize/Normalize.js";

/** A player's full attribute set with provenance, grouped as the domain expects. */
export interface InferredPlayer {
  readonly id: string;
  readonly name: string;
  readonly clubId: string;
  readonly position: Position;
  readonly secondaryPositions: readonly Position[];
  readonly nationality: readonly string[];
  readonly foot?: string;
  readonly ageYears: number;
  readonly heightCm?: number;
  readonly overall: number;
  readonly physical: Record<"pace" | "stamina" | "strength" | "agility", Attribute>;
  readonly mental: Record<"decisions" | "composure" | "workRate" | "teamwork" | "aggression" | "anticipation" | "positioning" | "vision", Attribute>;
  readonly technical: Record<"passing" | "technique" | "dribbling" | "finishing" | "shotPower" | "tackling" | "marking" | "crossing", Attribute>;
  readonly goalkeeping: Record<"reflexes" | "handling" | "positioning" | "oneOnOnes", Attribute>;
}

/** A coach's tactical attributes (generated — no player-stat signal). */
export interface InferredCoach {
  readonly adaptability: Attribute;
  readonly tacticalKnowledge: Attribute;
  readonly reactiveness: Attribute;
  readonly composure: Attribute;
}

function group(flat: Record<AttrName, Attribute>): Pick<InferredPlayer, "physical" | "mental" | "technical" | "goalkeeping"> {
  return {
    physical: { pace: flat.pace, stamina: flat.stamina, strength: flat.strength, agility: flat.agility },
    mental: {
      decisions: flat.decisions, composure: flat.composure, workRate: flat.workRate, teamwork: flat.teamwork,
      aggression: flat.aggression, anticipation: flat.anticipation, positioning: flat.positioning, vision: flat.vision,
    },
    technical: {
      passing: flat.passing, technique: flat.technique, dribbling: flat.dribbling, finishing: flat.finishing,
      shotPower: flat.shotPower, tackling: flat.tackling, marking: flat.marking, crossing: flat.crossing,
    },
    goalkeeping: { reflexes: flat.reflexes, handling: flat.handling, positioning: flat.gkPositioning, oneOnOnes: flat.oneOnOnes },
  };
}

/** Infer one player's full attribute set from its normalized form. Pure. */
export function inferPlayer(np: NormalizedPlayer): InferredPlayer {
  const overall = targetOverall(np.valuePct, np.appearancePct);
  const flat = applyPerturbations(shapeForPosition(np.position, overall), np);
  return {
    id: np.id,
    name: np.name,
    clubId: np.clubId,
    position: np.position,
    secondaryPositions: np.secondaryPositions,
    nationality: np.nationality,
    foot: np.foot,
    ageYears: np.ageYears,
    heightCm: np.heightCm,
    overall,
    ...group(flat),
  };
}

/** Generate a coach's tactical attributes from the club's market-value tier. */
export function inferCoach(clubValuePct: number): InferredCoach {
  const base = 45 + clubValuePct * 35; // 45..80
  return {
    adaptability: attr(base - 3, 0.3, "manual"),
    tacticalKnowledge: attr(base + 2, 0.3, "manual"),
    reactiveness: attr(base, 0.3, "manual"),
    composure: attr(base, 0.3, "manual"),
  };
}
