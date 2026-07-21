// People hierarchy
export { Person } from "./Person.js";
export { Player, type PlayerInit, OUT_OF_POSITION_FACTOR } from "./Player.js";
export { positionOverall } from "./overall.js";
export { Goalkeeper, type GoalkeeperInit } from "./Goalkeeper.js";
export { Coach, type CoachInit } from "./Coach.js";
export { Staff } from "./Staff.js";
export { Referee } from "./Referee.js";

// Attributes
export {
  type PhysicalAttributes,
  type MentalAttributes,
  type TechnicalAttributes,
  type GoalkeepingAttributes,
  type CoachAttributes,
  ATTRIBUTE_MIN,
  ATTRIBUTE_MAX,
  clampAttribute,
} from "./attributes.js";

// Shared vocabulary
export {
  Position,
  PositionGroup,
  OnBallAction,
  Mentality,
  MarkingScheme,
  mentalityToAttackBias,
  positionGroup,
  positionAdvancement,
  positionIsWide,
  isGoalkeeperPosition,
} from "./types.js";

// Roles
export { type Role, type RoleMovement } from "./roles/Role.js";
export { RoleKey, getRole, allRoles } from "./roles/library.js";
export { DefaultRoleProvider } from "./roles/DefaultRoleProvider.js";

// Tactics & team
export {
  Formation,
  Tactics,
  type TeamInstructions,
  type BaseSlot,
} from "./Tactics.js";
export { type FormationSlot, getFormationTemplate } from "./formations.js";
export { TacticsBuilder } from "./TacticsBuilder.js";
export { Team, type TeamInit } from "./Team.js";

// Injectable competition rules
export { SubstitutionRules } from "./rules/SubstitutionRules.js";
export { MatchRules } from "./rules/MatchRules.js";
export { TieContext } from "./rules/TieContext.js";
