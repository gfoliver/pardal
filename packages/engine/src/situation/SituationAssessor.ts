import { type MatchState } from "../state/MatchState.js";

export enum SituationKind {
  Chase = "chase",
  Protect = "protect",
  Neutral = "neutral",
}

/** A team's in-match objective and how strongly it holds it (0..1). */
export interface SituationObjective {
  readonly kind: SituationKind;
  readonly intensity: number;
}

/**
 * Turns the injected rules/context + scoreline + minute into a per-team
 * objective (chase vs protect the result). The KEY rule: the criterion is the
 * result that MATTERS — the isolated score in a league match, but the AGGREGATE
 * of the tie in a two-legged knockout (via `TieContext`). This is what makes a
 * side chase or sit on a lead correctly in each context.
 *
 * It is extensible: when competitions exist, the same assessor can also read the
 * championship situation (table position, stakes) as another injected input.
 */
export class SituationAssessor {
  assess(state: MatchState, teamId: string): SituationObjective {
    const opponentId = state.opponentOf(teamId);
    const effectiveDiff = this.effectiveGoalDifference(state, teamId, opponentId);

    // Urgency ramps up as the match progresses.
    const totalMinutes = this.expectedTotalMinutes(state);
    const timeFactor = Math.min(1, state.minute / Math.max(1, totalMinutes));

    if (effectiveDiff < 0) {
      const magnitude = Math.min(1, -effectiveDiff / 2);
      return {
        kind: SituationKind.Chase,
        intensity: clamp01(0.35 + magnitude * 0.4 + timeFactor * 0.35),
      };
    }
    if (effectiveDiff > 0) {
      const magnitude = Math.min(1, effectiveDiff / 2);
      return {
        kind: SituationKind.Protect,
        intensity: clamp01(0.2 + magnitude * 0.3 + timeFactor * 0.4),
      };
    }
    return { kind: SituationKind.Neutral, intensity: timeFactor * 0.3 };
  }

  /** Goal difference from `teamId`'s perspective, using aggregate when in a tie. */
  private effectiveGoalDifference(
    state: MatchState,
    teamId: string,
    opponentId: string,
  ): number {
    const forGoals = state.scoreFor(teamId);
    const againstGoals = state.scoreFor(opponentId);

    const tie = state.tieContext;
    if (!tie) return forGoals - againstGoals;

    // TieContext is expressed from this leg's home/away perspective.
    const homeCarry = tie.firstLegHomeTeamGoals;
    const awayCarry = tie.firstLegAwayTeamGoals;
    const side = state.sideOf(teamId);
    const forCarry = side === "home" ? homeCarry : awayCarry;
    const againstCarry = side === "home" ? awayCarry : homeCarry;

    return forGoals + forCarry - (againstGoals + againstCarry);
  }

  private expectedTotalMinutes(state: MatchState): number {
    return (
      state.rules.regulationMinutes +
      (state.rules.hasExtraTime ? state.rules.extraTimeMinutes : 0)
    );
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
