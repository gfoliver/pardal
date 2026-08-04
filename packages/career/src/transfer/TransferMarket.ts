import { type PlayerData } from "@fut/competition";
import { type Position, PositionGroup, positionGroup } from "@fut/domain";
import { GROUPS, MIN_SQUAD, REQUIRED_PER_GROUP, groupCounts } from "../squad/composition.js";
import { SeededRandom } from "@fut/engine";
import { effectiveOverall } from "../build/PlayerFactory.js";
import { SquadStatus } from "../contract/Contract.js";
import { MONTHS_PER_SEASON, feeHeadroom, recordFee } from "../club/Finance.js";
import { listingsBy } from "./TransferList.js";
import { type Loan, OfferStatus } from "./types.js";
import { InboxMessageType } from "../inbox/types.js";
import { transferSeed } from "../rng/seeds.js";
import { nextId } from "../state/ids.js";
import { OFFER_WINDOW_DAYS, isOpen } from "./Negotiation.js";
import { reconcileTactics } from "../tactics/StoredTactics.js";
import { absoluteDay } from "../time/tickDay.js";
import type { CareerState } from "../state/CareerState.js";
import { anchoredValue, marketValue, monthlyWage } from "../value/marketValue.js";

/**
 * Deterministic market value of a contracted player. When the dataset supplies a
 * REAL market value (Transfermarkt), that is the anchor — drifted by age and
 * form so it evolves across seasons; otherwise it falls back to the derived
 * attribute-based estimate. The fallback is load-bearing even on the real dataset:
 * 51 of its 670 players have no market value published.
 */
export function playerValue(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const data = dataById.get(playerId);
  const dev = state.playerDev[playerId];
  if (!data || !dev) return 0;
  const overall = effectiveOverall(data, dev);
  if (data.marketValue && data.marketValue > 0) {
    return anchoredValue(data.marketValue, { age: data.age, overall: effectiveOverall(data) }, { age: dev.ageAtSeasonStart, overall });
  }
  return marketValue({ overall, age: dev.ageAtSeasonStart, currentAbility: dev.currentAbility, potentialAbility: dev.potentialAbility });
}

/** The MONTHLY wage a player expects — the floor for agreeing personal terms. */
export function expectedWage(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const data = dataById.get(playerId);
  if (!data) return 0;
  return monthlyWage(playerValue(state, dataById, playerId));
}

/**
 * Sign a player at a club on a contract (moves registration + writes terms).
 *
 * The deal runs `years` from TODAY, keeping the day of the season. It used to expire on day 0 of the
 * target season, which quietly shortened every mid-season signing — agree three years on day 200 of
 * a 280-day season and only 2.3 of them were actually written. Signing on the last day of a window
 * lost almost a full year of the term the manager had just negotiated.
 */
function signAt(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string, fromClubId: string, toClubId: string, fee: number, wage: number, years: number): void {
  executeTransfer(state, dataById, playerId, fromClubId, toClubId, fee);
  state.contracts[playerId] = {
    playerId,
    clubId: toClubId,
    wage,
    expiry: { season: state.currentDate.season + years, dayOfSeason: state.currentDate.dayOfSeason },
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

/*
 * Squad-composition rules live in `squad/composition` now, because letting a contract lapse is a
 * third way to lose a player and it has to obey the same floor a sale does.
 */

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
    // Not every club does business every window. Without this the market runs 19 clubs
    // deep on every pass and a season produces hundreds of moves.
    if (!rng.chance(CLUB_ACTS_PER_WINDOW)) continue;
    const hole = neediestGroup(buyer.squad.playerIds, groupOf);
    const need = hole ?? weakestGroup(buyer.squad.playerIds, groupOf, ovrOf);
    if (need === null) continue;

    /**
     * A club filling a genuine HOLE takes anyone it can get; a club merely strengthening
     * will not sign a player worse than the man he would replace.
     *
     * Without this second case the upgrade path would happily buy a downgrade — the
     * candidate list is ranked by ability but the affordability filter walks DOWN it, so
     * a club with a modest budget lands on whoever is cheap rather than on whoever is
     * better than what it already has.
     */
    const mustBeat =
      hole !== null
        ? -Infinity
        : Math.min(...buyer.squad.playerIds.filter((id) => groupOf(id) === need).map(ovrOf));

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
      if (ovrOf(c.id) <= mustBeat) continue;
      const fee = Math.round(c.value * (1 + rng.next() * 0.1));
      const wage = expectedWage(state, dataById, c.id);
      // Fee AND salary come out of the same pot, so both have to fit in what is left of it.
      // This used to be three checks against three numbers — a transfer budget, a cash
      // balance, and a wage cap nothing else in the game respected.
      if (fee + wage * MONTHS_PER_SEASON > feeHeadroom(state, buyerId)) continue;
      if (sellerAccepts(state, c.id, c.value, fee)) {
        signAt(state, dataById, c.id, c.ownerId, buyerId, fee, expectedWage(state, dataById, c.id), 3);
        completed.push({ playerId: c.id, fromClubId: c.ownerId, toClubId: buyerId, fee, loan: false });
        dealt = true;
        break;
      }
    }
    if (!dealt) {
      const loanTarget = candidates.find((c) => (state.contracts[c.id]?.squadStatus ?? SquadStatus.Surplus) === SquadStatus.Surplus || state.contracts[c.id]?.squadStatus === SquadStatus.Backup);
      if (loanTarget) {
        loanPlayer(state, dataById, loanTarget.id, loanTarget.ownerId, buyerId);
        completed.push({ playerId: loanTarget.id, fromClubId: loanTarget.ownerId, toClubId: buyerId, fee: 0, loan: true });
      }
    }
  }
  return completed;
}

/**
 * Chance a given AI club tries to do business in a given window.
 *
 * The market runs every couple of weeks and there are nineteen other clubs, so without a
 * per-club appetite a season would produce hundreds of moves. Measured: at 0.16, a
 * Brasileirão season settles at roughly two or three signings per club.
 */
const CLUB_ACTS_PER_WINDOW = 0.16;

/**
 * The group where this squad is weakest, for a club with no positional HOLE to fill.
 *
 * Needed because `neediestGroup` only fires on a shortfall against `REQUIRED` (eighteen
 * players across the four groups), and a real squad carries thirty-odd — so on any
 * actual dataset it returns null for every club, always, and the AI market never bought
 * anybody even once it was wired to the clock. Clubs buy to IMPROVE, not only to fill a
 * hole, and this is the difference between a market that exists and one that does not.
 *
 * Weakest by the mean of the group's three best players rather than of all of them: a
 * club with four good strikers and four youngsters is not weak up front, and averaging
 * everybody would say it was.
 */
function weakestGroup(
  playerIds: readonly string[],
  groupOf: (id: string) => PositionGroup,
  ovrOf: (id: string) => number,
): PositionGroup | null {
  const byGroup = new Map<PositionGroup, number[]>();
  for (const id of playerIds) {
    const g = groupOf(id);
    const list = byGroup.get(g) ?? [];
    list.push(ovrOf(id));
    byGroup.set(g, list);
  }
  let worst: PositionGroup | null = null;
  let worstMean = Infinity;
  for (const g of GROUPS) {
    const ratings = (byGroup.get(g) ?? []).sort((a, b) => b - a).slice(0, 3);
    if (ratings.length === 0) return g; // nobody at all there: that is the weakness
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (mean < worstMean) {
      worstMean = mean;
      worst = g;
    }
  }
  return worst;
}

function neediestGroup(playerIds: readonly string[], groupOf: (id: string) => PositionGroup): PositionGroup | null {
  const counts = groupCounts(playerIds, groupOf);
  let worst: PositionGroup | null = null;
  let deficit = 0;
  for (const g of GROUPS) {
    const d = REQUIRED_PER_GROUP[g] - counts[g];
    if (d > deficit) {
      deficit = d;
      worst = g;
    }
  }
  return worst;
}

/**
 * What a bid has to be worth, as a multiple of the player's value, for his club to say
 * yes — a fringe player goes for less than he is worth, a key player for well over.
 */
const SELL_THRESHOLD: Record<SquadStatus, number> = {
  [SquadStatus.Surplus]: 0.8,
  [SquadStatus.Backup]: 0.95,
  [SquadStatus.Rotation]: 1.15,
  [SquadStatus.FirstTeam]: 1.5,
  [SquadStatus.Prospect]: 1.4,
  [SquadStatus.Key]: 2.5,
};

export function sellerAccepts(state: CareerState, playerId: string, value: number, fee: number): boolean {
  const status = state.contracts[playerId]?.squadStatus ?? SquadStatus.Surplus;
  return fee >= Math.round(value * SELL_THRESHOLD[status]);
}

/**
 * The price to open a transfer listing at.
 *
 * Deliberately the SAME number a rival club would have had to beat anyway
 * (`SELL_THRESHOLD` for his standing in the squad), so the suggestion is a real
 * valuation rather than a round number: a surplus man is offered below his value and a
 * key player well above his. What listing him then changes is how often anyone asks —
 * not what he is suddenly worth.
 */
export function suggestedAsk(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string): number {
  const status = state.contracts[playerId]?.squadStatus ?? SquadStatus.Surplus;
  return Math.round(playerValue(state, dataById, playerId) * SELL_THRESHOLD[status]);
}

/**
 * Re-pick the affected clubs' lineups after their rosters changed.
 *
 * Called by every path that moves a player, because a stored lineup is a list of ids that nothing
 * else keeps honest — see `reconcileTactics`. Both sides: the seller has a hole to fill and the buyer
 * has a new man to put on the bench.
 */
function afterRosterChange(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, ...clubIds: readonly string[]): void {
  const devById = new Map(Object.values(state.playerDev).map((d) => [d.playerId, d]));
  for (const id of new Set(clubIds)) {
    const club = state.clubs[id];
    if (club) reconcileTactics(club, dataById, devById);
  }
}

export function executeTransfer(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  fromClubId: string,
  toClubId: string,
  fee: number,
): void {
  completeTransfer(state, playerId, fromClubId, toClubId, fee);
  afterRosterChange(state, dataById, fromClubId, toClubId);
}

function completeTransfer(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number): void {
  const from = state.clubs[fromClubId]!;
  const to = state.clubs[toClubId]!;
  from.squad.playerIds = from.squad.playerIds.filter((p) => p !== playerId);
  to.squad.playerIds = [...to.squad.playerIds, playerId];
  recordFee(state, toClubId, fromClubId, fee);
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

function loanPlayer(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, playerId: string, ownerClubId: string, borrowerClubId: string): void {
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
  afterRosterChange(state, dataById, ownerClubId, borrowerClubId);
}

/**
 * Send loaned players back to the clubs that own them, and forget the loan.
 *
 * `loanPlayer` has always recorded an `until` date and NOTHING has ever read it, so a
 * "season loan" was permanent in effect and the loan list only grew. That went unnoticed
 * because loans were never created — `runTransferWindow` had no caller. The moment the
 * market was wired to the clock it became a real leak: a measured 75 players stranded at
 * borrowing clubs by the third season, with their owners stuck below the minimum squad
 * size and therefore unable to sell anybody either.
 *
 * Returning a player the borrower has since sold on would be wrong, so ownership is
 * checked rather than assumed.
 */
export function returnExpiredLoans(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): number {
  const season = state.currentDate.season;
  const staying: Loan[] = [];
  const touched = new Set<string>();
  let returned = 0;
  for (const loan of state.transfers.loans) {
    if (loan.until.season > season) {
      staying.push(loan);
      continue;
    }
    const owner = state.clubs[loan.ownerClubId];
    const borrower = state.clubs[loan.borrowerClubId];
    // If the player is no longer where the loan says he is, the loan is stale rather
    // than active: drop the record without moving anybody.
    if (owner && borrower && borrower.squad.playerIds.includes(loan.playerId)) {
      borrower.squad.playerIds = borrower.squad.playerIds.filter((p) => p !== loan.playerId);
      touched.add(loan.borrowerClubId);
      touched.add(loan.ownerClubId);
      if (!owner.squad.playerIds.includes(loan.playerId)) {
        owner.squad.playerIds = [...owner.squad.playerIds, loan.playerId];
      }
      returned++;
    }
  }
  state.transfers.loans = staying;
  afterRosterChange(state, dataById, ...touched);
  return returned;
}

/** The manager LODGES an offer for a player at another club — it stays pending;
 *  the owning AI club decides later (resolveOutgoingOffers on the next advance). */
export function userMakeOffer(state: CareerState, playerId: string, fee: number): boolean {
  const ownerId = Object.keys(state.clubs).find((cid) => cid !== state.managedClubId && state.clubs[cid]!.squad.playerIds.includes(playerId));
  if (!ownerId) return false;
  if (state.transfers.offers.some((o) => o.playerId === playerId && o.fromClubId === state.managedClubId && o.status === OfferStatus.Pending)) return false;
  state.transfers.offers.push({
    id: nextId(state, "offer"),
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
      state.inbox.push({ id: nextId(state, "txn"), type: InboxMessageType.PersonalTerms, date: { ...state.currentDate }, read: false, params: { playerId: offer.playerId, fromClubId: offer.toClubId, fee: offer.fee } });
    } else {
      offer.status = OfferStatus.Rejected;
      state.inbox.push({ id: nextId(state, "txn"), type: InboxMessageType.TransferRejected, date: { ...state.currentDate }, read: false, params: { playerId: offer.playerId, clubId: offer.toClubId, fee: offer.fee } });
    }
  }
}

/**
 * The manager agrees personal terms on a deal whose fee is already settled. The
 * player accepts if the wage meets ~90% of what he expects; then the move is
 * final and the negotiation is closed.
 *
 * Reads the NEGOTIATION, not a parallel `signings` list — see the note on
 * `Career.pendingSignings`. Closing the negotiation here is what stops a
 * completed signing from also lapsing on its own deadline a week later.
 */
export function agreeTerms(
  state: CareerState,
  dataById: ReadonlyMap<string, PlayerData>,
  playerId: string,
  wage: number,
  years: number,
): { signed: boolean; reason?: "holdsOut" | "overBudget" } {
  const n = state.negotiations.find(
    (x) => x.playerId === playerId && x.stage === "feeAgreed" && x.buyerClubId === state.managedClubId && x.agreedFee !== undefined,
  );
  if (!n) return { signed: false };
  if (wage < expectedWage(state, dataById, playerId) * 0.9) return { signed: false, reason: "holdsOut" };
  // The salary is part of the same budget as the fee, and the fee is not spent until now —
  // so the year of wages has to fit alongside it. Without this the wage side of the pot was
  // decorative: the only thing standing between the manager and any salary he liked was
  // whether the player said yes.
  if (n.agreedFee! + wage * MONTHS_PER_SEASON > feeHeadroom(state, state.managedClubId)) {
    return { signed: false, reason: "overBudget" };
  }
  signAt(state, dataById, playerId, n.sellerClubId, n.buyerClubId, n.agreedFee!, wage, years);
  n.stage = "completed";
  state.targetPlayerIds = state.targetPlayerIds.filter((id) => id !== playerId);
  return { signed: true };
}

/** Accept or reject a pending offer for one of the manager's players. On accept
 *  the BUYING (AI) club negotiates the player's contract automatically. */
export function respondToOffer(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, offerId: string, accept: boolean): void {
  const offer = state.transfers.offers.find((o) => o.id === offerId && o.status === OfferStatus.Pending);
  if (!offer) return;
  if (accept) {
    signAt(state, dataById, offer.playerId, offer.toClubId, offer.fromClubId, offer.fee, expectedWage(state, dataById, offer.playerId), 4);
    offer.status = OfferStatus.Completed;
  } else {
    offer.status = OfferStatus.Rejected;
  }
}

/**
 * How likely a rival is to come in for one of our players in a given interest window.
 *
 * A listed player is much likelier, which is the entire point of the transfer list: the
 * manager announcing somebody is available has to change what happens, or the list is
 * decoration.
 */
const INTEREST_CHANCE = 0.25;
const LISTED_INTEREST_CHANCE = 0.6;

/**
 * How many bids for our players may be live at once.
 *
 * The cap exists so the inbox is not buried, but with the unlisted figure alone a manager
 * who listed six players would still get two conversations and no idea which. A listing
 * raises it, because those are deals he has asked for.
 */
const OPEN_BIDS_CAP = 2;
const LISTED_BIDS_CAP = 5;

/**
 * How far above a player's value an asking price can be and still be met outright.
 *
 * Above this, an interested club bids its own valuation instead and the manager has to
 * negotiate. Without the limit, listing at ten times value would print money.
 */
const ASK_MET_LIMIT = 1.5;

/**
 * Rival clubs bid for the manager's better players — and for anyone he has listed.
 *
 * These open real negotiations with a deadline, so ignoring one costs the
 * manager the deal rather than parking it in the inbox forever.
 */
export function generateUserOffers(state: CareerState, dataById: ReadonlyMap<string, PlayerData>, tick: number): void {
  const rng = new SeededRandom(transferSeed(state.careerSeed, state.currentDate.season, 1000 + tick));
  const managed = state.clubs[state.managedClubId];
  if (!managed) return;
  const ranked = managed.squad.playerIds
    .map((id) => ({ id, ovr: effectiveOverall(dataById.get(id)!, state.playerDev[id]) }))
    .sort((a, b) => b.ovr - a.ovr);
  const buyers = Object.keys(state.clubs).filter((c) => c !== state.managedClubId).sort();
  const openForUs = () => state.negotiations.filter((n) => n.sellerClubId === state.managedClubId && isOpen(n)).length;
  const today = absoluteDay(state);

  const listed = new Map(listingsBy(state, state.managedClubId).map((l) => [l.playerId, l]));
  // Mid-tier players draw interest on their own — not the very best, not fringe. A LISTED
  // player draws it whatever his standing, and goes FIRST, so a cap that runs out is
  // never spent on somebody the manager was not trying to move.
  const candidates = [
    ...ranked.filter((r) => listed.has(r.id)),
    ...ranked.slice(3, 9).filter((r) => !listed.has(r.id)),
  ];
  const cap = listed.size > 0 ? LISTED_BIDS_CAP : OPEN_BIDS_CAP;

  for (const target of candidates) {
    if (openForUs() >= cap) break;
    const listing = listed.get(target.id);
    if (!rng.chance(listing ? LISTED_INTEREST_CHANCE : INTEREST_CHANCE)) continue;
    if (state.negotiations.some((n) => n.playerId === target.id && isOpen(n))) continue;
    const buyerId = buyers[rng.int(buyers.length)]!;
    const value = playerValue(state, dataById, target.id);
    // Drawn unconditionally, so the listed and unlisted paths consume the same amount of
    // the stream and listing a player cannot reshuffle everyone else's luck.
    const theirValuation = Math.round(value * (0.9 + rng.next() * 0.5));
    const fee = listing && listing.askingPrice <= Math.round(value * ASK_MET_LIMIT) ? listing.askingPrice : theirValuation;
    state.negotiations.push({
      id: nextId(state, "neg"),
      playerId: target.id,
      buyerClubId: buyerId,
      sellerClubId: state.managedClubId,
      stage: "offered",
      rounds: [{ by: "buyer", fee, on: { ...state.currentDate } }],
      openedOn: { ...state.currentDate },
      expiresDay: today + OFFER_WINDOW_DAYS,
    });
    state.inbox.push({ id: nextId(state, "txn"), type: InboxMessageType.TransferOfferReceived, date: { ...state.currentDate }, read: false, params: { playerId: target.id, fromClubId: buyerId, fee } });
  }
}

/**
 * Complete the deals whose fee is settled.
 *
 * A move we are SELLING completes on its own — the buying club sorts terms with
 * the player. A move we are BUYING waits for the manager to agree terms, which
 * is the one transfer decision that should still be theirs.
 */
export function settleAgreedFees(state: CareerState, dataById: ReadonlyMap<string, PlayerData>): void {
  for (const n of state.negotiations) {
    if (n.stage !== "feeAgreed" || n.sellerClubId !== state.managedClubId || n.agreedFee === undefined) continue;
    signAt(state, dataById, n.playerId, n.sellerClubId, n.buyerClubId, n.agreedFee, expectedWage(state, dataById, n.playerId), 4);
    n.stage = "completed";
  }
}

function pushTransferInbox(state: CareerState, playerId: string, fromClubId: string, toClubId: string, fee: number, loan: boolean): void {
  state.inbox.push({
    id: nextId(state, "txn"),
    type: InboxMessageType.TransferCompleted,
    date: { ...state.currentDate },
    read: false,
    params: { playerId, fromClubId, toClubId, fee, loan },
  });
}
