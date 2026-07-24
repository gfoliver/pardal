// Time & money
export { type SeasonDate, type Money, compareDates, onOrBefore } from "./time.js";

// Club
export { type Club, type Squad } from "./club/Club.js";
export { type Finance, type RevenueModel, totalWageBill } from "./club/Finance.js";
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

// State & commands (event-sourcing spine)
export { type CareerState, type CareerSnapshot } from "./state/CareerState.js";
export { type CareerCommand, type CareerCommandType } from "./command/CareerCommand.js";
export { apply, applyAll } from "./command/apply.js";
