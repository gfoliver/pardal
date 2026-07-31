import type { Money } from "../time.js";
import type { CareerState } from "../state/CareerState.js";

/**
 * A club's money: ONE annual budget, spent on fees and on wages.
 *
 * What this replaces, and why none of it was worth keeping:
 *
 *  - **A cash `balance` with matchday and TV income.** It did move — home games credited
 *    `matchdayPerHomeGame + tvPerRound`, every settled round debited a week of wages — but
 *    nothing downstream cared. Going negative had no consequence, no board reaction, no
 *    restriction. The one thing `balance` fed was next season's transfer budget, so an
 *    entire revenue model existed to produce a single number once a year.
 *  - **A separate `wageBudgetPerPeriod`.** Displayed with a meter, enforced on nobody: the
 *    only check on a wage was whether the PLAYER accepted it, so the manager could sign
 *    anyone at any salary and the meter would just fill past full.
 *  - **`netPerRound` on the finances screen.** A per-round profit the simulation never
 *    computes — wages are charged to everyone per round, income per fixture — so it was an
 *    invented figure that answered no question.
 *
 * The model now has three stored numbers and derives the rest. A pot per season, wages
 * annualised against it, fees in and out of the same pot. That makes the trade-off real:
 * a signing on a big salary costs a year of that salary out of the money you had for fees.
 */
export interface Finance {
  /** The board's allocation for this season. Fees AND the whole payroll come out of it. */
  annualBudget: Money;
  /** Fees paid out so far this season. */
  feesPaid: Money;
  /** Fees taken in for players sold this season. */
  feesReceived: Money;
}

/** Wages are stored MONTHLY, and a season is budgeted as a calendar year. */
export const MONTH_DAYS = 30;
export const MONTHS_PER_SEASON = 12;

/**
 * The share of its payroll a club has ON TOP of it to spend on fees.
 *
 * Calibrated to land where the transfer budget already was, so the market measurements
 * behind `CLUB_ACTS_PER_WINDOW` still hold: the median Brasileirão club's payroll is about
 * 150M a season, and 0.25 of that is ~38M of fee money — the figure the old
 * `balance * 0.9 * factor` produced.
 */
const TRANSFER_SLACK = 0.25;

/** Fee money a place in the final table is worth, from last to first. */
const PRIZE_PER_PLACE = 2_000_000;

/**
 * A club's monthly payroll — what it actually pays, loans included.
 *
 * A loan splits the salary, so this is not simply "everyone registered here". `wageSharePct`
 * had been written on every loan and read by nothing, which mattered the moment the payroll
 * started competing with fees for the same pot: loaning a big earner out would have taken
 * him off the books entirely, making a loan a way to launder wages rather than a football
 * decision. It is the same defect the `until` date had.
 */
export function monthlyWageBill(state: CareerState, clubId: string): Money {
  const club = state.clubs[clubId];
  if (!club) return 0;
  const share = new Map<string, number>();
  for (const loan of state.transfers.loans) {
    if (loan.borrowerClubId === clubId) share.set(loan.playerId, loan.wageSharePct);
    else if (loan.ownerClubId === clubId) share.set(loan.playerId, 1 - loan.wageSharePct);
  }
  let sum = 0;
  for (const pid of club.squad.playerIds) {
    sum += Math.round((state.contracts[pid]?.wage ?? 0) * (share.get(pid) ?? 1));
  }
  // Our share of anyone we own who is away on loan — he is not on our squad list to iterate.
  for (const loan of state.transfers.loans) {
    if (loan.ownerClubId !== clubId || club.squad.playerIds.includes(loan.playerId)) continue;
    sum += Math.round((state.contracts[loan.playerId]?.wage ?? 0) * (1 - loan.wageSharePct));
  }
  return sum;
}

/**
 * A club's season budget: its payroll, plus fee money on top, plus what finishing where it
 * did last season was worth.
 *
 * Anchored to the payroll rather than to a cash pile because the payroll is the one figure
 * that already reflects how good the squad is — a big club has a big wage bill and
 * therefore a big budget, with no revenue model needed to say so.
 *
 * The per-club factor is derived from the career seed and the club id rather than drawn,
 * because this is recomputed every rollover: a draw would give the same club a different
 * appetite each season for no reason, and would depend on the order clubs happened to be
 * processed in. It scales only the SLACK — scaling the whole budget would leave an unlucky
 * club unable to pay the wages it is already committed to.
 */
export function seasonBudget(
  careerSeed: number,
  clubId: string,
  payroll: Money,
  opts?: { finalPosition?: number; teamsInLeague?: number },
): Money {
  // FNV-1a over the club id, mixed with the career seed. Integer-only, so it is
  // identical on every runtime.
  let hash = 0x811c9dc5 ^ (careerSeed >>> 0);
  for (let i = 0; i < clubId.length; i++) {
    hash = Math.imul(hash ^ clubId.charCodeAt(i), 0x01000193) >>> 0;
  }
  // 0.75 … 1.40: enough that a bold board is visibly bolder than a cautious one, not so
  // much that it swamps the difference in the clubs' actual means.
  const factor = 0.75 + (hash % 66) / 100;
  const place = opts?.finalPosition;
  const teams = opts?.teamsInLeague ?? 0;
  const prize = place !== undefined && place > 0 && teams > 0 ? (teams - place + 1) * PRIZE_PER_PLACE : 0;
  return Math.max(0, Math.round(payroll * (1 + TRANSFER_SLACK * factor)) + prize);
}

/** A club's finances as anything reading them needs to understand them. */
export interface FinanceSummary {
  readonly annualBudget: Money;
  /** Today's payroll, per month. */
  readonly monthlyWageBill: Money;
  /** That payroll over a whole season — what the budget has to cover before any fee. */
  readonly payroll: Money;
  readonly feesPaid: Money;
  readonly feesReceived: Money;
  /** Payroll + fees already paid. */
  readonly committed: Money;
  /** What is left to spend, on a fee or on wages. Negative once overcommitted. */
  readonly available: Money;
  /**
   * Extra monthly salary the club could take on with everything it has left.
   *
   * The same money as `available`, in the unit a contract is written in — a wage is a
   * commitment for the year, so a month of it costs twelve times over.
   */
  readonly wageRoomPerMonth: Money;
}

/** Everything derived from a club's three stored figures plus its current payroll. */
export function summariseFinance(finance: Finance, monthlyBill: Money): FinanceSummary {
  const payroll = monthlyBill * MONTHS_PER_SEASON;
  const committed = payroll + finance.feesPaid;
  const available = finance.annualBudget + finance.feesReceived - committed;
  return {
    annualBudget: finance.annualBudget,
    monthlyWageBill: monthlyBill,
    payroll,
    feesPaid: finance.feesPaid,
    feesReceived: finance.feesReceived,
    committed,
    available,
    wageRoomPerMonth: Math.floor(available / MONTHS_PER_SEASON),
  };
}

/** What a club can still put on the table for a fee (never negative). */
export function feeHeadroom(state: CareerState, clubId: string): Money {
  const club = state.clubs[clubId];
  if (!club) return 0;
  return Math.max(0, summariseFinance(club.finance, monthlyWageBill(state, clubId)).available);
}

/**
 * Whether a club could take on `monthlyWage` of new salary.
 *
 * One rule for the AI market and for the manager. It used to be neither: an AI club checked
 * a wage budget nothing else respected, and the manager was checked only by whether the
 * player said yes.
 */
export function canAffordWage(state: CareerState, clubId: string, monthlyWage: Money): boolean {
  return monthlyWage * MONTHS_PER_SEASON <= feeHeadroom(state, clubId);
}

/** Record a completed fee against both sides' season. */
export function recordFee(state: CareerState, buyerClubId: string, sellerClubId: string, fee: Money): void {
  const buyer = state.clubs[buyerClubId];
  const seller = state.clubs[sellerClubId];
  if (buyer) buyer.finance.feesPaid += fee;
  if (seller) seller.finance.feesReceived += fee;
}

/** Sum of a squad's wages for one pay period. */
export function totalWageBill(wages: readonly Money[]): Money {
  let sum = 0;
  for (const w of wages) sum += w;
  return sum;
}
