// Randomness
export { type RandomSource } from "./random/RandomSource.js";
export { SeededRandom } from "./random/SeededRandom.js";

// Pitch
export { PitchGrid, type TeamSide } from "./pitch/PitchGrid.js";
export { type Zone, zone, sameZone, zonesAdjacent } from "./pitch/Zone.js";

// State
export {
  MatchState,
  Period,
  type PlayerMatchState,
  type PendingTacticChange,
} from "./state/MatchState.js";

// Situation
export {
  SituationAssessor,
  SituationKind,
  type SituationObjective,
} from "./situation/SituationAssessor.js";

// Positioning & decision
export { PositioningModel } from "./positioning/PositioningModel.js";
export { DecisionEngine } from "./decision/DecisionEngine.js";

// Actions
export { type ActionResolver, type ResolutionContext } from "./actions/ActionResolver.js";
export { createResolverRegistry, PASS_DEBUG } from "./actions/resolvers.js";

// Referee & rules resolution
export {
  RefereeAdjudicator,
  FoulSeverity,
  type FoulRuling,
} from "./referee/RefereeAdjudicator.js";

// Coaching
export {
  type CoachController,
  type CoachDecision,
  type SubstitutionDecision,
  type TacticChangeDecision,
} from "./coach/CoachController.js";
export { AiCoachController } from "./coach/AiCoachController.js";

// Substitutions, clock, shootout
export { SubstitutionManager } from "./substitution/SubstitutionManager.js";
export { MatchClock, type TimeSegment } from "./clock/MatchClock.js";
export {
  PenaltyShootoutResolver,
  type ShootoutResult,
} from "./shootout/PenaltyShootoutResolver.js";

// Results
export {
  MatchEventType,
  CardColor,
  type MatchEvent,
} from "./result/MatchEvent.js";
export {
  type TeamStats,
  createTeamStats,
  possessionPercent,
} from "./result/TeamStats.js";
export {
  DecidedBy,
  type Score,
  type MatchOutcome,
  type DisciplineRecord,
  type MatchResult,
} from "./result/MatchResult.js";

// Orchestrator
export { MatchSimulator, type MatchConfig } from "./MatchSimulator.js";
