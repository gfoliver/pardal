import { type PlayerData } from "@fut/competition";
import { type Position, PositionGroup, positionGroup } from "@fut/domain";
import { SeededRandom } from "@fut/engine";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { SquadStatus } from "../contract/Contract.js";
import { OfferStatus } from "./types.js";
import { InboxMessageType } from "../inbox/types.js";
import { transferSeed } from "../rng/seeds.js";
import type { CareerState } from "../state/CareerState.js";
import { marketValue } from "../value/marketValue.js";

let offerSeq = 0;

/** Deterministic market value of a contracted player. */
export function playerValue(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const data = dataById.get(playerId);
  const dev = state.playerDev[playerId];
  if (!data || !dev) return 0;
  return marketValue({ overall: effectiveOverall(data, dev), age: dev.ageAtSeasonStart, currentAbility: dev.currentAbility, potentialAbility: dev.potentialAbility });
}

/** The wage a player expects — the floor for agreeing personal terms. */
export function expectedWage(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const data = dataById.get(playerId);
  const dev = state.playerDev[playerId];
  if (!data) return 0;
  return Math.round(effectiveOverall(data, dev) * 1200);
}

/** Sign a player at a club on a contract (moves registration + writes terms). */
function signAt(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number, wage: number, years: number): void {
  executeTransfer(state, playerId, fromClubId, toClubId, fee);
  state.contracts[playerId] = {
    playerId,
    clubId: toClubId,
    wage,
    expiry: { season: state.currentDate.season + years, dayOfSeason: 0 },
    squadStatus: SquadStatus.Rotation,
    signedOn: { ...state.currentDate },
  };
}

export interface CompletedTransfer {
  readonly playerId: string;
  readonly fromClubId: string;
  readonly toClubId: string;
  readonly fee: number;
  readonly loan: boolean;
}

/** Minimum squad size a club will let itself drop to when selling/loaning out. */
const MIN_SQUAD = 16;
const REQUIRED: Record<PositionGroup, number> = {
  [PositionGroup.Goalkeeper]: 2,
  [PositionGroup.Defence]: 6,
  [PositionGroup.Midfield]: 6,
  [PositionGroup.Attack]: 4,
};

let txnCounter = 0;

/**
 * Run one deterministic transfer-window tick. AI clubs (in fixed clubId order)
 * each try to fill their neediest position group with the best affordable
 * target from another AI club; a failed buy falls back to a season loan of a
 * surplus player. The managed club never auto-acts (its deals go through the
 * UI/inbox). Reproducible from transferSeed → same completed set every run.
 */
export function runTransferWindow(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  tick: number,
): CompletedTransfer[] {
  const rng = new SeededRandom(transferSeed(state.careerSeed, state.currentDate.season, tick));
  const completed: CompletedTransfer[] = [];
  const clubIds = Object.keys(state.clubs).sort();
  const groupOf = (id: string): PositionGroup => positionGroup(dataById.get(id)!.position as Position);
  const ovrOf = (id: string): number => effectiveOverall(dataById.get(id)!, state.playerDev[id]);
  const valueOf = (id: string): number => {
    const dev = state.playerDev[id]!;
    return marketValue({ overall: ovrOf(id), age: dev.ageAtSeasonStart, currentAbility: dev.currentAbility, potentialAbility: dev.potentialAbility });
  };

  for (const buyerId of clubIds) {
    if (buyerId === state.managedClubId) continue; // user decides own transfers
    const buyer = state.clubs[buyerId]!;
    const need = neediestGroup(buyer.squad.playerIds, groupOf);
    if (need === null) continue;

    // Candidates: players of the needed group at OTHER AI clubs, ranked by ability.
    const candidates: { id: string; ownerId: string; value: number }[] = [];
    for (const ownerId of clubIds) {
      if (ownerId === buyerId || ownerId === state.managedClubId) continue;
      const owner = state.clubs[ownerId]!;
      if (owner.squad.playerIds.length <= MIN_SQUAD) continue;
      for (const pid of owner.squad.playerIds) {
        if (groupOf(pid) !== need) continue;
        candidates.push({ id: pid, ownerId, value: valueOf(pid) });
      }
    }
    candidates.sort((a, b) => ovrOf(b.id) - ovrOf(a.id) || (a.id < b.id ? -1 : 1));

    // Try a permanent buy first, else a loan.
    let dealt = false;
    for (const c of candidates) {
      const fee = Math.round(c.value * (1 + rng.next() * 0.1));
      const wage = state.contracts[c.id]?.wage ?? 0;
      const affordable = fee <= buyer.finance.transferBudget && fee <= buyer.finance.balance && wage <= buyer.finance.wageBudgetPerPeriod;
      if (!affordable) continue;
      if (sellerAccepts(state, c.id, c.value, fee)) {
        signAt(state, c.id, c.ownerId, buyerId, fee, expectedWage(state, dataById, c.id), 3);
        completed.push({ playerId: c.id, fromClubId: c.ownerId, toClubId: buyerId, fee, loan: false });
        dealt = true;
        break;
      }
    }
    if (!dealt) {
      const loanTarget = candidates.find((c) => (state.contracts[c.id]?.squadStatus ?? SquadStatus.Surplus) === SquadStatus.Surplus || state.contracts[c.id]?.squadStatus === SquadStatus.Backup);
      if (loanTarget) {
        loanPlayer(state, loanTarget.id, loanTarget.ownerId, buyerId);
        completed.push({ playerId: loanTarget.id, fromClubId: loanTarget.ownerId, toClubId: buyerId, fee: 0, loan: true });
      }
    }
  }
  return completed;
}

function neediestGroup(playerIds: readonly string[], groupOf: (id: string) => PositionGroup): PositionGroup | null {
  const counts: Record<PositionGroup, number> = {
    [PositionGroup.Goalkeeper]: 0,
    [PositionGroup.Defence]: 0,
    [PositionGroup.Midfield]: 0,
    [PositionGroup.Attack]: 0,
  };
  for (const id of playerIds) counts[groupOf(id)]++;
  let worst: PositionGroup | null = null;
  let deficit = 0;
  for (const g of Object.keys(REQUIRED) as PositionGroup[]) {
    const d = REQUIRED[g] - counts[g];
    if (d > deficit) {
      deficit = d;
      worst = g;
    }
  }
  return worst;
}

export function sellerAccepts(state: CareerState, playerId: string, value: number, fee: number): boolean {
  const status = state.contracts[playerId]?.squadStatus ?? SquadStatus.Surplus;
  const threshold: Record<SquadStatus, number> = {
    [SquadStatus.Surplus]: 0.8,
    [SquadStatus.Backup]: 0.95,
    [SquadStatus.Rotation]: 1.15,
    [SquadStatus.FirstTeam]: 1.5,
    [SquadStatus.Prospect]: 1.4,
    [SquadStatus.Key]: 2.5,
  };
  return fee >= Math.round(value * threshold[status]);
}

export function executeTransfer(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number): void {
  completeTransfer(state, playerId, fromClubId, toClubId, fee);
}

function completeTransfer(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number): void {
  const from = state.clubs[fromClubId]!;
  const to = state.clubs[toClubId]!;
  from.squad.playerIds = from.squad.playerIds.filter((p) => p !== playerId);
  to.squad.playerIds = [...to.squad.playerIds, playerId];
  from.finance.balance += fee;
  from.finance.transferBudget += fee;
  to.finance.balance -= fee;
  to.finance.transferBudget -= fee;
  const prev = state.contracts[playerId];
  state.contracts[playerId] = {
    playerId,
    clubId: toClubId,
    wage: prev?.wage ?? 0,
    expiry: { season: state.currentDate.season + 3, dayOfSeason: 0 },
    squadStatus: SquadStatus.Rotation,
    signedOn: { ...state.currentDate },
  };
  pushTransferInbox(state, playerId, fromClubId, toClubId, fee, false);
}

function loanPlayer(state: CareerState, playerId: string, ownerClubId: string, borrowerClubId: string): void {
  const owner = state.clubs[ownerClubId]!;
  const borrower = state.clubs[borrowerClubId]!;
  owner.squad.playerIds = owner.squad.playerIds.filter((p) => p !== playerId);
  borrower.squad.playerIds = [...borrower.squad.playerIds, playerId];
  state.transfers.loans.push({
    playerId,
    ownerClubId,
    borrowerClubId,
    until: { season: state.currentDate.season, dayOfSeason: state.totalDays },
    wageSharePct: 0.5,
  });
  pushTransferInbox(state, playerId, ownerClubId, borrowerClubId, 0, true);
}

/** The manager LODGES an offer for a player at another club — it stays pending;
 *  the owning AI club decides later (resolveOutgoingOffers on the next advance). */
export function userMakeOffer(state: CareerState, playerId: string, fee: number): boolean {
  const ownerId = Object.keys(state.clubs).find((cid) => cid !== state.managedClubId && state.clubs[cid]!.squad.playerIds.includes(playerId));
  if (!ownerId) return false;
  if (state.transfers.offers.some((o) => o.playerId === playerId && o.fromClubId === state.managedClubId && o.status === OfferStatus.Pending)) return false;
  state.transfers.offers.push({
    id: `offer-${offerSeq++}`,
    playerId,
    fromClubId: state.managedClubId,
    toClubId: ownerId,
    fee,
    proposedWage: state.contracts[playerId]?.wage ?? 0,
    contractYears: 4,
    status: OfferStatus.Pending,
    createdOn: { ...state.currentDate },
  });
  return true;
}

/** Resolve the manager's OUTGOING pending offers — the AI owner accepts/rejects
 *  (the user's own club never auto-decides its incoming offers). */
export function resolveOutgoingOffers(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  for (const offer of state.transfers.offers) {
    if (offer.status !== OfferStatus.Pending || offer.fromClubId !== state.managedClubId) continue;
    const value = playerValue(state, dataById, offer.playerId);
    if (sellerAccepts(state, offer.playerId, value, offer.fee)) {
      // Fee agreed — now the manager must agree personal terms with the player.
      offer.status = OfferStatus.Accepted;
      (state.transfers.signings ??= []).push({ playerId: offer.playerId, fromClubId: offer.toClubId, toClubId: state.managedClubId, fee: offer.fee });
      state.inbox.push({ id: `txn-${txnCounter++}`, type: InboxMessageType.PersonalTerms, date: { ...state.currentDate }, read: false, params: { playerId: offer.playerId, fromClubId: offer.toClubId, fee: offer.fee } });
    } else {
      offer.status = OfferStatus.Rejected;
      state.inbox.push({ id: `txn-${txnCounter++}`, type: InboxMessageType.TransferRejected, date: { ...state.currentDate }, read: false, params: { playerId: offer.playerId, clubId: offer.toClubId, fee: offer.fee } });
    }
  }
}

/** The manager agrees personal terms with a fee-agreed signing. The player
 *  accepts if the wage meets ~90% of his expectation; then the move is final. */
export function agreeTerms(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string, wage: number, years: number): { signed: boolean } {
  const signing = state.transfers.signings?.find((s) => s.playerId === playerId);
  if (!signing) return { signed: false };
  if (wage < expectedWage(state, dataById, playerId) * 0.9) return { signed: false }; // player holds out
  signAt(state, playerId, signing.fromClubId, signing.toClubId, signing.fee, wage, years);
  state.transfers.signings = state.transfers.signings!.filter((s) => s.playerId !== playerId);
  state.targetPlayerIds = state.targetPlayerIds.filter((id) => id !== playerId);
  return { signed: true };
}

/** Accept or reject a pending offer for one of the manager's players. On accept
 *  the BUYING (AI) club negotiates the player's contract automatically. */
export function respondToOffer(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, offerId: string, accept: boolean): void {
  const offer = state.transfers.offers.find((o) => o.id === offerId && o.status === OfferStatus.Pending);
  if (!offer) return;
  if (accept) {
    signAt(state, offer.playerId, offer.toClubId, offer.fromClubId, offer.fee, expectedWage(state, dataById, offer.playerId), 4);
    offer.status = OfferStatus.Completed;
  } else {
    offer.status = OfferStatus.Rejected;
  }
}

/** Generate a few AI bids for the manager's better players → decision inbox. */
export function generateUserOffers(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, tick: number): void {
  const rng = new SeededRandom(transferSeed(state.careerSeed, state.currentDate.season, 1000 + tick));
  const managed = state.clubs[state.managedClubId];
  if (!managed) return;
  const ranked = managed.squad.playerIds
    .map((id) => ({ id, ovr: effectiveOverall(dataById.get(id)!, state.playerDev[id]) }))
    .sort((a, b) => b.ovr - a.ovr);
  const buyers = Object.keys(state.clubs).filter((c) => c !== state.managedClubId).sort();
  // Up to 2 offers for mid-tier players (not the very best, not fringe).
  for (const target of ranked.slice(3, 9)) {
    if (!rng.chance(0.25)) continue;
    const buyerId = buyers[rng.int(buyers.length)]!;
    const value = playerValue(state, dataById, target.id);
    const fee = Math.round(value * (0.9 + rng.next() * 0.5));
    const offer = { id: `offer-${offerSeq++}`, playerId: target.id, fromClubId: buyerId, toClubId: state.managedClubId, fee, proposedWage: state.contracts[target.id]?.wage ?? 0, contractYears: 3, status: OfferStatus.Pending, createdOn: { ...state.currentDate } };
    state.transfers.offers.push(offer);
    state.inbox.push({ id: `txn-${txnCounter++}`, type: InboxMessageType.TransferOfferReceived, date: { ...state.currentDate }, read: false, params: { playerId: target.id, fromClubId: buyerId, fee } });
    if (state.transfers.offers.filter((o) => o.status === OfferStatus.Pending).length >= 2) break;
  }
}

function pushTransferInbox(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number, loan: boolean): void {
  state.inbox.push({
    id: `txn-${txnCounter++}`,
    type: InboxMessageType.TransferCompleted,
    date: { ...state.currentDate },
    read: false,
    params: { playerId, fromClubId, toClubId, fee, loan },
  });
}
