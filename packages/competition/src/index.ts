// Data
export {
  type PlayerData,
  type CoachData,
  type TeamData,
  type LeagueData,
} from "./data/schema.js";
export {
  DataValidationError,
  loadPlayer,
  loadCoach,
  loadTeam,
  loadTeams,
  loadLeagueTeams,
} from "./data/loader.js";

// League
export { type Fixture, generateFixtures } from "./league/Fixture.js";
export {
  type DatedFixture,
  type ScheduleConfig,
  assignDates,
  hasSameDayConflict,
  matchDays,
} from "./league/schedule.js";
export {
  type PromotionRules,
  type PromotionResult,
  resolvePromotionRelegation,
} from "./league/promotion.js";
export { type CupTie, type CupRound, pairRound, roundsNeeded } from "./cup/Bracket.js";
export {
  type FixtureResult,
  type GoalRecord,
  type StandingRow,
  computeStandings,
  POINTS_WIN,
  POINTS_DRAW,
} from "./league/Standings.js";
export {
  type ScorerRow,
  type AssisterRow,
  type DefensiveRow,
  type FormRow,
  type ResultChar,
  type SeasonStats,
  computeSeasonStats,
} from "./league/SeasonStats.js";
export {
  League,
  type LeagueOptions,
  type SeasonResult,
  matchSeed,
} from "./league/League.js";
export {
  type SeasonSnapshot,
  type SeasonStore,
  InMemorySeasonStore,
  toSnapshot,
  serializeSeason,
  deserializeSeason,
  tableFromSnapshot,
  statsFromSnapshot,
} from "./league/season.js";
