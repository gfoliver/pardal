import { type Tactics } from "@fut/domain";
import { type RandomSource } from "../random/RandomSource.js";
import { type MatchState } from "../state/MatchState.js";

/** A tactic change requested by a coach (takes effect after assimilation). */
export interface TacticChangeDecision {
  readonly kind: "tacticChange";
  readonly tactics: Tactics;
}

/** A substitution requested by a coach. */
export interface SubstitutionDecision {
  readonly kind: "substitution";
  readonly outPlayerId: string;
  readonly inPlayerId: string;
}

export type CoachDecision = TacticChangeDecision | SubstitutionDecision;

/**
 * A coach's decision-making, identical for a human or the AI (LSP): given a
 * READ-ONLY view of the match, it returns zero or more interventions. The
 * simulator validates and applies them (substitutions against the injected
 * rules; tactic changes with an assimilation delay).
 */
export interface CoachController {
  decide(
    state: MatchState,
    teamId: string,
    rng: RandomSource,
  ): CoachDecision[];
}
