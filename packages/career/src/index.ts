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
export {
  type Finance,
  type FinanceSummary,
  canAffordWage,
  feeHeadroom,
  monthlyWageBill,
  seasonBudget,
  summariseFinance,
  totalWageBill,
  MONTH_DAYS,
  MONTHS_PER_SEASON,
} from "./club/Finance.js";
export { type BoardObjectives, newObjectives } from "./club/BoardObjectives.js";

// Contract
export { type Contract, SquadStatus } from "./contract/Contract.js";
export {
  OFFER_WINDOW_DAYS,
  MAX_COUNTER_ROUNDS,
  isOpen,
  respondToBid,
  type Negotiation,
  type NegotiationStage,
  type RejectionReason,
} from "./transfer/Negotiation.js";
export { sellerStance, type SellerStance } from "./transfer/valuation.js";
export { bidHeadroom, refuseOffer, type OfferRefusal } from "./transfer/NegotiationEngine.js";
export {
  contractDemands,
  offerContract,
  wageRatio,
  type ContractDemands,
  type ContractOutcome,
  type ContractRefusal,
} from "./contract/ContractNegotiation.js";
export { WARNING_DAYS, daysUntilExpiry, expiringSoon } from "./contract/expiry.js";
export type { PlayerSeason } from "./state/CareerState.js";
export { tickDay, type DayTickResult } from "./time/tickDay.js";
export { nextId } from "./state/ids.js";

// Scouting: what the manager knows, as opposed to what is true.
export {
  ATTR_GROUPS,
  KNOWLEDGE_TIERS,
  MAX_RIVAL_CONFIDENCE,
  OWN_PLAYER_CONFIDENCE,
  attributeKnowledge,
  estimateMoney,
  estimateOf,
  overallGrade,
  potentialStars,
  relevanceAt,
  squadFit,
  tierFor,
  type AttrGroup,
  type AttrKnowledge,
  type ChartFidelity,
  type Estimate,
  type KnowledgeTier,
  type OverallFidelity,
  type SquadFit,
} from "./scouting/knowledge.js";

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
  type DirectoryEntry, type FreeAgentRow, type PlayerGameLine, type PlayerSeasonView, type PlayerStatsView, type SixAttrs, type SquadEntry, type TacticsPlayer, type TacticsSlot, type TacticsView, type TransferTarget,
  type ListedPlayer,
  type NegotiationView, type ScoutingView, type WatchedPlayer, type ExpiringContract,
  type RoundView, type RoundMatchView,
  type SavedTacticSummary, type TacticsDiagnostic, type TacticsDiagnosticKind, type TacticsDiagnosticSeverity } from "./career/Career.js";
export { type StoredInstructions, type StoredTactics, type SavedTactic, DEFAULT_FAMILIARITY, MATCHDAY_BENCH_SIZE, reconcileTactics } from "./tactics/StoredTactics.js";
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
export { type CompletedTransfer, generateUserOffers, runTransferWindow, suggestedAsk } from "./transfer/TransferMarket.js";
export {
  DECISION_DAYS,
  aiBidForFreeAgents,
  bidForFreeAgent,
  freeAgentDemands,
  freeAgentPool,
  isFreeAgent,
  resolveFreeAgents,
  withdrawFreeAgentBid,
  type BidRefusal,
  type FreeAgentBid,
  type FreeAgentDemands,
  type FreeAgentInterest,
} from "./transfer/FreeAgents.js";
export { activeListings, isListed, listingFor, listingsBy, pruneListings } from "./transfer/TransferList.js";

// Development / aging
export { progressSeason } from "./development/DevelopmentEngine.js";

// State & commands (event-sourcing spine)
export { type CareerState, type CareerSnapshot, type CareerCompetition } from "./state/CareerState.js";
export { type CareerCommand, type CareerCommandType } from "./command/CareerCommand.js";
export { apply, applyAll, MAX_SAVED_TACTICS } from "./command/apply.js";
