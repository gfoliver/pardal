import { type Position, PositionGroup, positionGroup } from "@fut/domain";
import type { PlayerData } from "@fut/competition";
import { SquadStatus } from "../contract/Contract.js";
import { feeHeadroom } from "../club/Finance.js";
import type { CareerState } from "../state/CareerState.js";
import { playerValue } from "./TransferMarket.js";

/**
 * What a club will actually take for a player.
 *
 * The old rule was one number — market value times a multiplier for how highly
 * the club rated him. That made every club interchangeable: a relegation side
 * and the champions asked the same for the same player, and nobody cared
 * whether selling would leave a hole.
 *
 * The asking price now answers "what would it take to make this worth our
 * while", which depends on the seller's situation as much as the player's
 * quality. Deterministic — same state, same price, so a replay agrees.
 */

/** How much more than market value each rung of the hierarchy costs. */
const STATUS_PREMIUM: Record<SquadStatus, number> = {
  [SquadStatus.Surplus]: 0.8,
  [SquadStatus.Backup]: 0.95,
  [SquadStatus.Rotation]: 1.15,
  [SquadStatus.Prospect]: 1.4,
  [SquadStatus.FirstTeam]: 1.5,
  [SquadStatus.Key]: 2.5,
};

/** Below this many players in a position group, a club stops selling from it. */
const THIN: Record<PositionGroup, number> = {
  [PositionGroup.Goalkeeper]: 2,
  [PositionGroup.Defence]: 6,
  [PositionGroup.Midfield]: 6,
  [PositionGroup.Attack]: 4,
};

export interface SellerStance {
  readonly askingPrice: number;
  /** Selling would leave them short in that position — no price fixes that. */
  readonly squadTooThin: boolean;
  readonly isKeyPlayer: boolean;
}

/**
 * The selling club's position on one of its players.
 *
 * Three things move the price beyond raw value:
 *  - **hierarchy** — a key player costs a multiple of a squad filler;
 *  - **the seller's standing** — a big club has less need of the money, so it
 *    asks for more to be tempted at all;
 *  - **depth** — a club one injury from trouble in that position won't sell.
 */
export function sellerStance(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
): SellerStance {
  const contract = state.contracts[playerId];
  const status = contract?.squadStatus ?? SquadStatus.Surplus;
  const seller = contract ? state.clubs[contract.clubId] : undefined;
  const value = playerValue(state, dataById, playerId);

  // A well-off club is harder to tempt: reputation 50 is neutral, 100 adds 25%.
  const standing = 1 + ((seller?.reputation ?? 50) - 50) / 200;

  const group = positionGroup((dataById.get(playerId)?.position ?? "") as Position);
  const depth = (seller?.squad.playerIds ?? []).filter(
    (id) => positionGroup((dataById.get(id)?.position ?? "") as Position) === group,
  ).length;

  return {
    askingPrice: Math.round(value * STATUS_PREMIUM[status] * standing),
    squadTooThin: depth <= THIN[group],
    isKeyPlayer: status === SquadStatus.Key,
  };
}

/**
 * The most a club will actually pay for a player.
 *
 * Needed the moment the manager could name his own price to a bidder: without a
 * ceiling the AI would either take any number (making selling a formality) or
 * refuse everything above its opening bid (making the counter pointless).
 *
 * Two things bound it — appetite, which scales with how big the buyer is, and what is left
 * of the season's budget, which is hard. A club that cannot afford it does not want it,
 * however much it rates the player.
 */
export function buyerCeiling(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  buyerClubId: string,
): number {
  const buyer = state.clubs[buyerClubId];
  const value = playerValue(state, dataById, playerId);
  // Reputation 50 pays market; 100 will stretch to 1.6x, 0 stops at 1.1x.
  const appetite = 1.1 + ((buyer?.reputation ?? 50) / 100) * 0.5;
  return Math.max(0, Math.min(Math.round(value * appetite), feeHeadroom(state, buyerClubId)));
}
