import type { PlayerData } from "@fut/competition";
import { SeededRandom } from "@fut/engine";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { canRelease } from "../squad/composition.js";
import { contractDemands } from "./ContractNegotiation.js";
import { SquadStatus } from "./Contract.js";
import { expectedWage } from "../transfer/TransferMarket.js";
import type { CareerState } from "../state/CareerState.js";

/**
 * Whether an AI club re-signs a player whose deal is running out.
 *
 * It used to renew every one of them, unconditionally and forever, so the manager was the only
 * person in the league who ever lost anybody. The point of this file is that an AI club is also
 * having a conversation: sometimes the player wants more than he is worth to them, sometimes he has
 * declined past the point where they want him, and sometimes he simply is not needed.
 *
 * Evaluated against the SAME `contractDemands` the manager negotiates against, so the number a rival
 * refuses is the number he would have been quoted.
 *
 * Deterministic: the coin is seeded from the career seed, the player and the season, so a re-run of
 * the same career reaches the same decisions and the outcome cannot depend on the order clubs were
 * processed in.
 */

export type RenewalRefusal =
  /** Asking more than the club thinks he is worth. */
  | "tooExpensive"
  /** Past his best and getting worse. */
  | "declining"
  /** Good enough, just not needed — the club is deep in his position. */
  | "surplus";

export type RenewalDecision = { readonly renew: true } | { readonly renew: false; readonly reason: RenewalRefusal };

/** Seasons out an AI club re-signs for. Middling on purpose: it is not negotiating length. */
const AI_RENEWAL_YEARS = 3;

/**
 * How far above the going rate a club will go, by how much it values him.
 *
 * A key player gets indulged; a squad filler asking for a rise does not. These are multiples of
 * `expectedWage`, which is what the market says he is worth.
 *
 * Every one sits ABOVE the matching `STATUS_APPETITE` in `ContractNegotiation`, and that is a
 * constraint rather than a coincidence: a player's opening demand IS market × his appetite, so a
 * tolerance below it would refuse him before he had asked for anything unusual. The first draft had
 * Surplus at 0.80 against an appetite of 0.85, which quietly made "too expensive" true of every
 * fringe player in the league whatever he earned. What should trip this is a club ALREADY overpaying
 * a player who will not take a cut — `contractDemands` floors the demand at his current wage.
 */
const WAGE_TOLERANCE: Readonly<Record<SquadStatus, number>> = {
  [SquadStatus.Key]: 1.75, // appetite 1.45
  [SquadStatus.FirstTeam]: 1.45, // 1.20
  [SquadStatus.Prospect]: 1.6, // 1.10 — a club backs its young players well past the going rate
  [SquadStatus.Rotation]: 1.25, // 1.05
  [SquadStatus.Backup]: 1.1, // 0.95
  [SquadStatus.Surplus]: 1.0, // 0.85
};

/** Age past which a club starts reading a fading player as one to let go. */
const DECLINE_AGE = 31;

/**
 * The chance a club lets a player go for each reason it has to.
 *
 * Deliberately short of certainty. A club that always released everyone who ticked a box would empty
 * its fringe every season and the league would churn; one that never did would be back to the old
 * always-renew. The manager should be able to notice a rival's contract situation and plan for it
 * without being able to count on it.
 */
const RELEASE_CHANCE: Readonly<Record<RenewalRefusal, number>> = {
  tooExpensive: 0.7,
  declining: 0.5,
  surplus: 0.35,
};

/**
 * Decide one AI renewal.
 *
 * When several reasons apply the FIRST is reported, so the order is the order of explanations a
 * director of football would give. Decline leads: a fading veteran is usually also on a wage his club
 * resents, and "he is past it" is the reason — the money is the symptom.
 */
export function decideRenewal(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  rng: SeededRandom,
): RenewalDecision {
  const contract = state.contracts[playerId];
  const data = dataById.get(playerId);
  if (!contract || !data) return { renew: true };

  const club = state.clubs[contract.clubId];
  /*
   * The floor, and the reason it comes first: an AI club never releases below it, so nothing below
   * decides anything for a club already down to its last two keepers.
   *
   * This binds AI clubs only. A human manager has no floor — he gets the warnings and it is his
   * squad to run down. What the league must not do is dissolve around him.
   */
  if (!club || !canRelease(club.squad.playerIds, playerId, dataById)) return { renew: true };

  const demands = contractDemands(state, dataById, playerId);
  if (!demands) return { renew: true };

  const dev = state.playerDev[playerId];
  const age = dev?.ageAtSeasonStart ?? data.age;
  const market = expectedWage(state, dataById, playerId);
  const status = contract.squadStatus;

  const reasons: RenewalRefusal[] = [];

  /*
   * Declining: old AND already below his own ceiling.
   *
   * Both halves are needed. Age alone would release every veteran, including the ones still playing
   * well; `currentAbility` below `potentialAbility` alone is true of nearly every young player, who
   * is the last person a club lets go.
   */
  if (age >= DECLINE_AGE && dev && dev.currentAbility < dev.potentialAbility) reasons.push("declining");

  // Asking above what someone of his standing is worth here.
  if (market > 0 && demands.wage > market * WAGE_TOLERANCE[status]) reasons.push("tooExpensive");

  // Not needed: the club has better in his position and he is not part of the plan.
  if (status === SquadStatus.Surplus || status === SquadStatus.Backup) {
    const mine = effectiveOverall(data, dev);
    const betterInPosition = club.squad.playerIds.filter((id) => {
      if (id === playerId) return false;
      const other = dataById.get(id);
      return other?.position === data.position && effectiveOverall(other, state.playerDev[id]) > mine;
    }).length;
    if (betterInPosition >= 2) reasons.push("surplus");
  }

  /*
   * One draw per reason, in a fixed order, and every reason draws whether or not an earlier one has
   * already decided it. Drawing only until the first success would make the stream depend on which
   * reasons applied, and two careers with the same seed would diverge.
   */
  let refusal: RenewalRefusal | undefined;
  for (const reason of ["declining", "tooExpensive", "surplus"] as const) {
    const applies = reasons.includes(reason);
    const drawn = rng.chance(RELEASE_CHANCE[reason]);
    if (applies && drawn && refusal === undefined) refusal = reason;
  }

  return refusal === undefined ? { renew: true } : { renew: false, reason: refusal };
}

/** Terms an AI club re-signs on: what he asked for, for a middling length. */
export function aiRenewalTerms(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
): { wage: number; years: number } {
  const demands = contractDemands(state, dataById, playerId);
  return { wage: demands?.wage ?? state.contracts[playerId]?.wage ?? 0, years: AI_RENEWAL_YEARS };
}
