import {
  type MatchRules,
  type SubstitutionRules,
  type Team,
  type TieContext,
} from "@fut/domain";
import { type CoachController } from "./coach/CoachController.js";
import { type MatchResult } from "./result/MatchResult.js";
import { LiveMatch } from "./live/LiveMatch.js";

export interface MatchConfig {
  readonly home: Team;
  readonly away: Team;
  readonly seed: number;
  readonly matchRules: MatchRules;
  readonly substitutionRules: SubstitutionRules;
  readonly tieContext?: TieContext;
  readonly homeController?: CoachController;
  readonly awayController?: CoachController;
  /** Action-steps simulated per minute (default 3). */
  readonly stepsPerMinute?: number;
}

/**
 * Orchestrates a full match to completion. The tick loop, coach interventions,
 * refereeing, extra time and the shootout all live in `LiveMatch`; this simply
 * drives it to the end. A watchable, minute-by-minute match uses the same
 * `LiveMatch` driver directly, so "quick sim" and "watch" are identical for a
 * given seed (when no human intervenes).
 */
export class MatchSimulator {
  simulate(config: MatchConfig): MatchResult {
    const match = new LiveMatch(config);
    let guard = 0;
    // Regulation + extra time is bounded; the guard is only a safety net.
    while (!match.advance().done && guard++ < 100_000) {
      /* advance to full time */
    }
    return match.result();
  }
}
