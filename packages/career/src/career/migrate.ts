import { Formation, Mentality } from "@fut/domain";
import type { PlayerData } from "@fut/competition";
import type { Club } from "../club/Club.js";
import {
  buildDefaultTactic,
  DEFAULT_FAMILIARITY,
  type SavedTactic,
  type StoredTactics,
} from "../tactics/StoredTactics.js";
import { daysFromCivil, DEFAULT_START } from "../calendar/dates.js";
import { MONTHS_PER_SEASON, monthlyWageBill, seasonBudget } from "../club/Finance.js";
import { highestExistingId } from "../state/ids.js";
import { MAX_RIVAL_CONFIDENCE } from "../scouting/knowledge.js";
import { emptyScouting } from "../scouting/types.js";
import type { CareerState } from "../state/CareerState.js";

/**
 * Bring a loaded save up to the current shape, in place and idempotently.
 *
 * Two different jobs live here, and both have to run before anything reads the
 * state:
 *
 *  - **Field migrations** — a save written before a field existed gets a
 *    sensible default rather than `undefined` leaking into a view.
 *  - **Dataset reconciliation** — the save and the dataset are separate
 *    artifacts with separate lifetimes. Re-scraping a league drops players who
 *    left, and a save still listing them used to crash the squad screen on
 *    `dataById.get(id)!.name`. A save must survive its dataset moving.
 */
export function migrateState(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): CareerState {
  if (state.startEpochDay == null) {
    (state as { startEpochDay: number }).startEpochDay = daysFromCivil(DEFAULT_START.year, DEFAULT_START.month, DEFAULT_START.day);
  }
  if (state.scoutedPlayerIds == null) (state as { scoutedPlayerIds: string[] }).scoutedPlayerIds = [];
  if (state.targetPlayerIds == null) (state as { targetPlayerIds: string[] }).targetPlayerIds = [];
  migrateToScoutingModel(state);
  if (!Array.isArray(state.negotiations)) state.negotiations = [];
  // Resume the id counter ABOVE what the save already uses, or a fresh id would
  // collide with an entity minted by the old module-level counters.
  if (state.nextEntityId == null) state.nextEntityId = highestExistingId(state) + 1;

  dropPlayersMissingFromDataset(state, dataById);
  migrateToNamedTactics(state, dataById);
  // AFTER the dataset reconciliation, so a budget is set against the squad that survived it.
  migrateToSeasonBudget(state);
  return state;
}

/**
 * Turn a save's old cash-and-two-budgets finances into one annual pot.
 *
 * The old shape carried `balance`, `transferBudget`, `wageBudgetPerPeriod` and a `revenue`
 * block. None of it translates: the pot is anchored to the payroll, and the old balance was
 * a running total of matchday and TV income against weekly wages — a number with no meaning
 * in a model that never charges per round. So every club gets the budget it would get at a
 * rollover, which is the same thing that would happen if the save ticked over one season.
 *
 * Left as it is: whatever the club had already spent. Reconstructing a season's fees from a
 * balance is not possible, and starting everyone at zero spent is the generous reading —
 * better than inventing a debt the manager cannot see the cause of.
 */
function migrateToSeasonBudget(state: CareerState): void {
  for (const clubId of Object.keys(state.clubs ?? {})) {
    const club = state.clubs[clubId]!;
    const finance = club.finance as Partial<typeof club.finance> | undefined;
    if (finance && typeof finance.annualBudget === "number") continue;
    club.finance = {
      annualBudget: seasonBudget(state.careerSeed, clubId, monthlyWageBill(state, clubId) * MONTHS_PER_SEASON),
      feesPaid: 0,
      feesReceived: 0,
    };
  }
}

/**
 * Forget every player the dataset no longer describes.
 *
 * The squad list is the one that MUST be cleaned — a dangling id there reaches
 * `dataById.get(id)!` and throws. The rest (lineups, contracts, shortlists) is
 * cleaned in the same pass so the save doesn't quietly carry references to
 * people who no longer exist.
 */
function dropPlayersMissingFromDataset(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  const known = (id: string) => dataById.has(id);
  const gone = new Set<string>();

  for (const club of Object.values(state.clubs)) {
    for (const id of club.squad.playerIds) if (!known(id)) gone.add(id);
    club.squad.playerIds = club.squad.playerIds.filter(known);
  }
  if (gone.size === 0) return;

  for (const club of Object.values(state.clubs)) {
    for (const tactic of club.tacticSlots ?? []) {
      // A lineup slot is positional: blank the departed rather than compacting,
      // or every player after them shifts into the wrong slot.
      tactic.lineup = tactic.lineup.map((id) => (id && gone.has(id) ? undefined : id)) as typeof tactic.lineup;
      tactic.bench = tactic.bench?.filter((id) => !gone.has(id));
      for (const id of gone) delete tactic.roles[id];
    }
  }
  for (const id of gone) {
    delete state.contracts[id];
    delete state.playerDev[id];
  }
  state.scoutedPlayerIds = state.scoutedPlayerIds.filter((id) => !gone.has(id));
  state.targetPlayerIds = state.targetPlayerIds.filter((id) => !gone.has(id));
  state.transfers.offers = state.transfers.offers.filter((o) => !gone.has(o.playerId));
  state.transfers.listings = state.transfers.listings.filter((l) => !gone.has(l.playerId));
  state.transfers.loans = state.transfers.loans.filter((l) => !gone.has(l.playerId));
  if (state.transfers.signings) state.transfers.signings = state.transfers.signings.filter((s) => !gone.has(s.playerId));
}

/**
 * Turn the old boolean "scouted" list into graded knowledge.
 *
 * A player the manager had already revealed keeps what that used to mean — full
 * sight of his potential — which maps to the top rung observation can reach.
 * Demoting them to zero would silently confiscate work the user had done.
 */
function migrateToScoutingModel(state: CareerState): void {
  if (state.scouting?.knowledge) {
    // A save from before the queue existed has assignments and knowledge but no line behind them.
    state.scouting.queue ??= [];
    // `capacity` used to live here. It is derived from reputation now, so the stored copy is dead
    // weight — and a career in progress would otherwise keep the three or four slots it was created
    // with after the rule became six to ten.
    delete (state.scouting as { capacity?: number }).capacity;
    return;
  }
  state.scouting = emptyScouting();
  for (const id of state.scoutedPlayerIds ?? []) {
    state.scouting.knowledge[id] = { confidence: MAX_RIVAL_CONFIDENCE, reports: 1 };
  }
}

/**
 * Fold a pre-multi-tactic save's single formation/mentality/tactics trio into
 * one saved tactic named "1". Idempotent: a save already on the new shape is
 * left alone.
 */
function migrateToNamedTactics(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  const devById = new Map(Object.values(state.playerDev).map((d) => [d.playerId, d]));
  for (const club of Object.values(state.clubs)) {
    const legacy = club as Club & { formation?: Formation; mentality?: Mentality; tactics?: StoredTactics };
    if (!Array.isArray(club.tacticSlots) || club.tacticSlots.length === 0) {
      const mentality = legacy.mentality ?? Mentality.Balanced;
      const base: Omit<SavedTactic, "id" | "name"> = legacy.tactics
        ? { ...legacy.tactics, formation: legacy.formation ?? Formation.F442, mentality, familiarity: DEFAULT_FAMILIARITY }
        : buildDefaultTactic(club.squad.playerIds, mentality, dataById, devById);
      club.tacticSlots = [{ id: "t1", name: "1", ...base }];
      club.activeTacticId = "t1";
      delete legacy.tactics;
      delete legacy.formation;
      delete legacy.mentality;
    }
    if (!club.tacticSlots.some((s) => s.id === club.activeTacticId)) club.activeTacticId = club.tacticSlots[0]!.id;
  }
}
