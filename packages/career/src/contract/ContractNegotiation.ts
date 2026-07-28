import type { PlayerData } from "@fut/competition";
import { SquadStatus } from "./Contract.js";
import { effectiveOverall } from "../build/PlayerFactory.js";
import type { CareerState } from "../state/CareerState.js";
import { expectedWage, playerValue } from "../transfer/TransferMarket.js";

/**
 * Renewing a contract, as a conversation with someone who has an opinion.
 *
 * `renewContract(id, wage, years)` used to overwrite the contract outright: the
 * player always said yes, at any wage, for any length. Nothing about a squad was
 * ever at risk, which is why the expiry date could go unread for so long without
 * anybody noticing.
 *
 * Pure over `(state, dataById, playerId)` — no clock, no randomness — so the same
 * squad always asks for the same thing.
 */

/** What the player wants, and the least he'll take. */
export interface ContractDemands {
  /** The wage he's asking for. */
  readonly wage: number;
  /** He'll sign at or above this. Below it, he holds out. */
  readonly minimumWage: number;
  /** Length he wants, in seasons. */
  readonly years: number;
  /** The standing he believes he has earned. */
  readonly status: SquadStatus;
}

export type ContractOutcome =
  | { readonly kind: "accepted" }
  /** Not enough — he restates what it would take. */
  | { readonly kind: "countered"; readonly demands: ContractDemands }
  | { readonly kind: "rejected"; readonly reason: ContractRefusal };

export type ContractRefusal =
  /** Far enough below his worth that it reads as an insult. */
  | "insulting"
  /** He's angling for a move, not a renewal. */
  | "wantsToLeave";

/** Below this share of what he expects, an offer stops being a negotiation. */
const INSULT_THRESHOLD = 0.6;

/** He signs at this share of his asking wage. */
const ACCEPT_THRESHOLD = 0.92;

/**
 * How much a player's standing in the squad inflates what he asks for.
 *
 * A key player prices himself as one; a fringe player knows he has little
 * leverage. This is where the squad-status promise earns its keep — telling
 * someone he's central costs nothing today and shows up in his next demand.
 */
const STATUS_APPETITE: Record<SquadStatus, number> = {
  [SquadStatus.Surplus]: 0.85,
  [SquadStatus.Backup]: 0.95,
  [SquadStatus.Rotation]: 1.05,
  [SquadStatus.Prospect]: 1.1,
  [SquadStatus.FirstTeam]: 1.2,
  [SquadStatus.Key]: 1.45,
};

/**
 * What this player will ask for.
 *
 * Built from what he's worth on the market, inflated by his standing, and
 * shortened by age — a 34-year-old wants security and a 21-year-old wants a
 * deal he can outgrow, so length runs the opposite way to what you'd guess.
 */
export function contractDemands(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
): ContractDemands | undefined {
  const data = dataById.get(playerId);
  const contract = state.contracts[playerId];
  if (!data || !contract) return undefined;

  const dev = state.playerDev[playerId];
  const age = dev?.ageAtSeasonStart ?? data.age;
  const status = contract.squadStatus;
  const market = expectedWage(state, dataById, playerId);

  // Never less than he's on now — nobody negotiates himself downwards.
  const wage = Math.max(contract.wage, Math.round(market * STATUS_APPETITE[status]));

  return {
    wage,
    minimumWage: Math.round(wage * ACCEPT_THRESHOLD),
    // Youngsters take short deals to re-price after they grow; veterans want
    // the security of a long one.
    years: age < 24 ? 3 : age < 30 ? 4 : 2,
    status,
  };
}

/**
 * Put terms to a player.
 *
 * Three answers, not one: yes; not yet, and here's the number; or no, and
 * here's why. A counter is the useful case — it turns "he refused" into a
 * decision the manager can actually make.
 */
export function offerContract(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  terms: { wage: number; years: number },
): ContractOutcome {
  const demands = contractDemands(state, dataById, playerId);
  if (!demands) return { kind: "rejected", reason: "wantsToLeave" };

  if (terms.wage < demands.wage * INSULT_THRESHOLD) {
    return { kind: "rejected", reason: "insulting" };
  }
  if (terms.wage >= demands.minimumWage) return { kind: "accepted" };
  return { kind: "countered", demands };
}

/**
 * A rough read on how good a deal the club is getting, for the UI: the wage as
 * a multiple of what the player is worth. Above 1 means we're overpaying.
 */
export function wageRatio(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const contract = state.contracts[playerId];
  const market = expectedWage(state, dataById, playerId);
  return market > 0 && contract ? contract.wage / market : 1;
}

/** Squad value at risk: what we'd lose if this contract simply ran out. */
export function valueAtRisk(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  return playerValue(state, dataById, playerId);
}

/** The rating a player would take with him — used to rank expiry warnings. */
export function abilityOf(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const data = dataById.get(playerId);
  return data ? effectiveOverall(data, state.playerDev[playerId]) : 0;
}
