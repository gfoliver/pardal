// Time & money
export { type SeasonDate, type Money, compareDates, onOrBefore } from "./time.js";
export {
  type CivilDate,
  SEASON_YEAR_DAYS,
  DEFAULT_START,
  daysFromCivil,
  civilFromDays,
  weekday,
  epochDayOf,
  civilOf,
} from "./calendar/dates.js";

// Club
export { type Club, type Squad, activeTactic } from "./club/Club.js";
export { type Finance, type RevenueModel, totalWageBill, wagesPerRound, MONTH_DAYS, ROUND_DAYS } from "./club/Finance.js";
export { type BoardObjectives, newObjectives } from "./club/BoardObjectives.js";

// Contract
export { type Contract, SquadStatus } from "./contract/Contract.js";

// Development
export {
  type PlayerDev,
  type AttrName,
  type Injury,
  type Suspension,
  newPlayerDev,
  isAvailable,
} from "./development/PlayerDev.js";

// Value
export {
  type MarketValueInput,
  marketValue,
  anchoredValue,
  monthlyWage,
  ageCurve,
  potentialMultiplier,
} from "./value/marketValue.js";

// Transfer
export {
  type TransferListing,
  type TransferOffer,
  type Loan,
  type TransferState,
  OfferStatus,
} from "./transfer/types.js";

// Structure
export { type Division, type CupConfig, type CompetitionStructure } from "./structure/types.js";

// Inbox
export { type InboxMessage, InboxMessageType } from "./inbox/types.js";

// Data
export { type DatasetProvider, InMemoryDatasetProvider } from "./data/DatasetProvider.js";

// Determinism
export { competitionSeed, devSeed, transferSeed } from "./rng/seeds.js";

// Build (base data + dev → match-ready domain objects)
export { buildPlayer, effectiveOverall } from "./build/PlayerFactory.js";
export { buildMatchTeam } from "./build/TeamBuilder.js";

// Career creation & season runner
export { type NewCareerOptions, createCareer, indexPlayers } from "./career/createCareer.js";
export { CareerRunner } from "./career/CareerRunner.js";

// Façade (the clean UI entry point)
export { Career, type ClubDetailView, type ClubHighlight, type PlayerDetailView, type MatchSummaryView,
  type PlayerStatsView, type SixAttrs, type SquadEntry, type TacticsPlayer, type TacticsSlot, type TacticsView, type TransferTarget,
  type SavedTacticSummary, type TacticsDiagnostic, type TacticsDiagnosticKind, type TacticsDiagnosticSeverity } from "./career/Career.js";
export { type StoredInstructions, type StoredTactics, type SavedTactic, DEFAULT_FAMILIARITY, MATCHDAY_BENCH_SIZE } from "./tactics/StoredTactics.js";
export { type TacticPreset, type TacticPresetKey, TACTIC_PRESETS, matchPreset } from "./tactics/presets.js";
export { aggregatePlayerStats, computeMatchLines, type AggregatedStats, type PlayerGame } from "./stats/PlayerStats.js";

// Persistence
export {
  type CareerStore,
  InMemoryCareerStore,
  CareerSaveError,
  SAVE_VERSION,
  serializeCareer,
  deserializeCareer,
  validateSnapshot,
} from "./persistence/CareerStore.js";

// Transfer market
export { type CompletedTransfer, runTransferWindow } from "./transfer/TransferMarket.js";

// Development / aging
export { progressSeason } from "./development/DevelopmentEngine.js";

// State & commands (event-sourcing spine)
export { type CareerState, type CareerSnapshot, type CareerCompetition } from "./state/CareerState.js";
export { type CareerCommand, type CareerCommandType } from "./command/CareerCommand.js";
export { apply, applyAll, MAX_SAVED_TACTICS } from "./command/apply.js";
