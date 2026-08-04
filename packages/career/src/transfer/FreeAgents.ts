import type { PlayerData } from "@fut/competition";
import { type Position, PositionGroup, positionGroup } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { canAffordWage } from "../club/Finance.js";
import { SquadStatus } from "../contract/Contract.js";
import { InboxMessageType } from "../inbox/types.js";
import { transferSeed } from "../rng/seeds.js";
import { GROUPS, MAX_SQUAD, REQUIRED_PER_GROUP, groupCounts } from "../squad/composition.js";
import { nextId } from "../state/ids.js";
import { reconcileTactics } from "../tactics/StoredTactics.js";
import { absoluteDay } from "../time/tickDay.js";
import type { Money } from "../time.js";
import { expectedWage, playerValue } from "./TransferMarket.js";
import type { CareerState } from "../state/CareerState.js";
import type { SeasonDate } from "../time.js";

/**
 * The free-agent market: out-of-contract players, and the clubs competing to sign them.
 *
 * Modelled as a WAGE AUCTION rather than as a transfer, because that is what it is. A transfer is a
 * two-party haggle over one number with a seller who can refuse; a free agent has no seller, no fee,
 * and several suitors at once — so `Negotiation` was the wrong shape and using it would have meant a
 * fabricated seller id and a zero fee threaded through every fee-shaped code path.
 *
 * The competition is the point. Before this, `freeAgentIds` was written by contract expiry and read
 * by nothing, so a released player left the game permanently: measured over five seasons, 670 players
 * under contract fell to 364 with 306 parked in an unsignable pool, and AI squads sank from a mean of
 * 33.8 to the composition floor. Every club now draws from that pool, which both drains it and puts
 * the manager in a race he can lose.
 *
 * A bid is not a signing. Offers sit on the table until the player decides (see `DECISION_DAYS`), so
 * the manager can be outbid by a club that moved later, and can raise his own offer in response.
 */

/** One club's standing offer to a free agent. A club has at most one; a new bid replaces it. */
export interface FreeAgentBid {
  readonly clubId: string;
  readonly wage: Money;
  readonly years: number;
  readonly on: SeasonDate;
}

/** A free agent weighing up the offers in front of him. */
export interface FreeAgentInterest {
  readonly playerId: string;
  bids: FreeAgentBid[];
  /** Absolute day he makes his mind up. Set when the FIRST bid lands, not when he came loose. */
  decidesDay: number;
}

/**
 * How long a free agent takes to decide, from the first offer.
 *
 * Long enough that the manager can react to being outbid — a race decided the instant an AI club bid
 * would be a race he could only win by luck — and short enough that a player he wants does not sit
 * unsigned for a month.
 */
export const DECISION_DAYS = 7;

/** Wage a free agent expects, as a share of his market rate. */
const UNEMPLOYED_DISCOUNT = 0.95;

/** Below this share of his asking wage he is not interested at all. */
const ACCEPT_SHARE = 0.85;

/** How much of the decision rides on money, the rest on the club. */
const WAGE_WEIGHT = 0.75;
const REPUTATION_WEIGHT = 0.25;

/** Wage above his asking price stops helping — you cannot simply buy any free agent. */
const WAGE_SCORE_CAP = 1.4;

/** Chance an AI club with a reason to bid actually does, per pass. */
const AI_BID_CHANCE = 0.45;

/** What a free agent is asking for. */
export interface FreeAgentDemands {
  readonly wage: Money;
  readonly minimumWage: Money;
  readonly years: number;
}

/**
 * What he wants.
 *
 * Slightly UNDER his market rate, unlike a contracted player who is floored at what he already earns
 * and inflated by his standing. An unemployed player has no leverage, and that discount is most of
 * why signing a free agent is worth doing.
 */
export function freeAgentDemands(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
): FreeAgentDemands | undefined {
  const data = dataById.get(playerId);
  if (!data || !isFreeAgent(state, playerId)) return undefined;
  const market = expectedWage(state, dataById, playerId);
  const wage = Math.max(1, Math.round(market * UNEMPLOYED_DISCOUNT));
  const age = state.playerDev[playerId]?.ageAtSeasonStart ?? data.age;
  return {
    wage,
    minimumWage: Math.round(wage * ACCEPT_SHARE),
    // Same shape as a contracted player's: the young take short deals to re-price, veterans want security.
    years: age < 24 ? 3 : age < 30 ? 4 : 2,
  };
}

export const isFreeAgent = (state: CareerState, playerId: string): boolean =>
  (state.freeAgentIds ?? []).includes(playerId) && state.contracts[playerId] === undefined;

export type BidRefusal = "notFree" | "insulting" | "cannotAfford";

/**
 * Put an offer to a free agent.
 *
 * Used by the manager and by AI clubs alike, so neither can do something the other cannot. Replacing
 * your own bid is allowed — that is how you answer being outbid — but it does NOT extend his decision
 * day, or a club could keep a player waiting indefinitely by nudging its offer.
 */
export function bidForFreeAgent(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  clubId: string,
  wage: Money,
  years: number,
): { placed: boolean; reason?: BidRefusal } {
  const demands = freeAgentDemands(state, dataById, playerId);
  if (!demands) return { placed: false, reason: "notFree" };
  if (wage < demands.minimumWage) return { placed: false, reason: "insulting" };
  if (!canAffordWage(state, clubId, wage)) return { placed: false, reason: "cannotAfford" };

  const board = (state.freeAgentBids ??= []);
  let interest = board.find((i) => i.playerId === playerId);
  if (!interest) {
    interest = { playerId, bids: [], decidesDay: absoluteDay(state) + DECISION_DAYS };
    board.push(interest);
  }
  const bid: FreeAgentBid = { clubId, wage, years: Math.max(1, Math.min(5, Math.round(years))), on: { ...state.currentDate } };
  const existing = interest.bids.findIndex((b) => b.clubId === clubId);
  if (existing >= 0) interest.bids[existing] = bid;
  else interest.bids.push(bid);
  return { placed: true };
}

/** Withdraw our offer — he is no longer someone we are chasing. */
export function withdrawFreeAgentBid(state: CareerState, playerId: string, clubId: string): void {
  const interest = (state.freeAgentBids ?? []).find((i) => i.playerId === playerId);
  if (!interest) return;
  interest.bids = interest.bids.filter((b) => b.clubId !== clubId);
}

/**
 * How attractive one offer is to him.
 *
 * Money dominates but does not decide alone, and it stops helping above `WAGE_SCORE_CAP` — otherwise
 * the richest club in the league signs every free agent, and a manager with a smaller budget could
 * never compete on anything else. Reputation is the rest: a player will take a little less to join a
 * bigger club.
 */
function scoreBid(state: CareerState, bid: FreeAgentBid, demands: FreeAgentDemands): number {
  const money = Math.min(WAGE_SCORE_CAP, bid.wage / Math.max(1, demands.wage));
  const reputation = (state.clubs[bid.clubId]?.reputation ?? 50) / 100;
  return money * WAGE_WEIGHT + reputation * REPUTATION_WEIGHT;
}

/** Sign a free agent, on the terms he accepted. */
function signFreeAgent(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  bid: FreeAgentBid,
): void {
  const club = state.clubs[bid.clubId];
  if (!club) return;
  club.squad.playerIds = [...club.squad.playerIds, playerId];
  state.contracts[playerId] = {
    playerId,
    clubId: bid.clubId,
    wage: bid.wage,
    // `years` from today, keeping the day of the season — the same rule every other signing follows.
    expiry: { season: state.currentDate.season + bid.years, dayOfSeason: state.currentDate.dayOfSeason },
    squadStatus: SquadStatus.Rotation,
    signedOn: { ...state.currentDate },
  };
  state.freeAgentIds = (state.freeAgentIds ?? []).filter((id) => id !== playerId);
  // A new player is a roster change: without this he is registered but in nobody's lineup or bench.
  reconcileTactics(club, dataById, new Map(Object.values(state.playerDev).map((d) => [d.playerId, d])));
}

/**
 * Settle every free agent whose decision day has come.
 *
 * Bids below his minimum are already refused at `bidForFreeAgent`, so anything still on the table is
 * acceptable to him and the best one wins. A club that can no longer afford its own offer — its wage
 * room having gone on someone else in the meantime — is skipped rather than allowed to overcommit.
 */
export function resolveFreeAgents(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, today: number): void {
  const board = state.freeAgentBids ?? [];
  const settled: string[] = [];

  for (const interest of board) {
    if (today < interest.decidesDay) continue;
    settled.push(interest.playerId);
    const demands = freeAgentDemands(state, dataById, interest.playerId);
    // He signed elsewhere, or retired out of the pool: the offers are moot.
    if (!demands) continue;

    const viable = interest.bids.filter((b) => state.clubs[b.clubId] && canAffordWage(state, b.clubId, b.wage));
    if (viable.length === 0) continue;

    // Sorted, not reduced, so the tie-break is explicit: best offer, then club id.
    const ranked = [...viable].sort(
      (a, b) => scoreBid(state, b, demands) - scoreBid(state, a, demands) || (a.clubId < b.clubId ? -1 : 1),
    );
    const winner = ranked[0]!;
    signFreeAgent(state, dataById, interest.playerId, winner);

    const name = dataById.get(interest.playerId)?.name ?? interest.playerId;
    if (winner.clubId === state.managedClubId) {
      state.inbox.push({
        id: nextId(state, "fa"),
        type: InboxMessageType.FreeAgentSigned,
        date: { ...state.currentDate },
        read: false,
        params: { playerId: interest.playerId, name, wage: winner.wage, years: winner.years, rivals: viable.length - 1 },
      });
    } else if (interest.bids.some((b) => b.clubId === state.managedClubId)) {
      // Losing a race is news; losing one you were not in is not.
      state.inbox.push({
        id: nextId(state, "fa"),
        type: InboxMessageType.FreeAgentLost,
        date: { ...state.currentDate },
        read: false,
        params: { playerId: interest.playerId, name, clubId: winner.clubId, wage: winner.wage },
      });
    }
  }

  if (settled.length > 0) {
    state.freeAgentBids = board.filter((i) => !settled.includes(i.playerId));
  }
}

/**
 * AI clubs going after free agents.
 *
 * Two reasons to move, and both are needed. A club short of the composition minimum in a line has to
 * sign someone, and that alone is what keeps the pool draining and AI squads off the floor. But a club
 * with a full squad still takes a free upgrade, and without that the manager would never face
 * competition for the players actually worth having — the pool's best would sit there untouched.
 *
 * Deterministic over (careerSeed, season, tick) like the transfer window, and it walks clubs in sorted
 * id order so the outcome cannot depend on object key order.
 */
export function aiBidForFreeAgents(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  tick: number,
): void {
  const pool = (state.freeAgentIds ?? []).filter((id) => dataById.has(id));
  if (pool.length === 0) return;

  const rng = new SeededRandom(transferSeed(state.careerSeed, state.currentDate.season, tick + 7919));
  const groupOf = (id: string): PositionGroup => {
    const d = dataById.get(id);
    return d ? positionGroup(d.position as Position) : PositionGroup.Midfield;
  };
  const ovrOf = (id: string): number => effectiveOverall(dataById.get(id)!, state.playerDev[id]);
  // Best first, so a club that acts takes the best player it can rather than the first it looks at.
  const ranked = [...pool].sort((a, b) => ovrOf(b) - ovrOf(a) || (a < b ? -1 : 1));

  for (const clubId of Object.keys(state.clubs).sort()) {
    if (clubId === state.managedClubId) continue; // the manager bids for himself
    const club = state.clubs[clubId]!;
    const counts = groupCounts(club.squad.playerIds, groupOf);
    const short = GROUPS.filter((g) => counts[g] < REQUIRED_PER_GROUP[g]);

    for (const playerId of ranked) {
      if (state.contracts[playerId]) continue; // signed already, earlier in this pass
      const group = groupOf(playerId);
      const mustFill = short.includes(group);
      if (!mustFill) {
        /*
         * An upgrade, and only while the club has room for one.
         *
         * The ceiling is what stops this running away: a wealthy club is never short of free agents
         * better than its worst man, so without it one had accumulated ninety players in five
         * seasons. A club over the ceiling can still fill a genuine hole above.
         */
        if (club.squad.playerIds.length >= MAX_SQUAD) continue;
        const inLine = club.squad.playerIds.filter((id) => groupOf(id) === group);
        const worst = inLine.length > 0 ? Math.min(...inLine.map(ovrOf)) : -Infinity;
        if (ovrOf(playerId) <= worst) continue;
      }
      // Drawn for every candidate a club considers, so the stream does not depend on how many it
      // happened to be short of.
      if (!rng.chance(AI_BID_CHANCE)) continue;

      const demands = freeAgentDemands(state, dataById, playerId);
      if (!demands) continue;
      // A club filling a hole pays what he asks; one merely strengthening offers his minimum.
      const wage = mustFill ? demands.wage : demands.minimumWage;
      const placed = bidForFreeAgent(state, dataById, playerId, clubId, wage, demands.years).placed;
      if (placed) break; // one target per club per pass
    }
  }
}

/** Free agents, best first — what the market screen lists. */
export function freeAgentPool(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
): { playerId: string; overall: number; value: Money }[] {
  return (state.freeAgentIds ?? [])
    .filter((id) => dataById.has(id) && !state.contracts[id])
    .map((id) => ({
      playerId: id,
      overall: Math.round(effectiveOverall(dataById.get(id)!, state.playerDev[id])),
      value: playerValue(state, dataById, id),
    }))
    .sort((a, b) => b.overall - a.overall || (a.playerId < b.playerId ? -1 : 1));
}
