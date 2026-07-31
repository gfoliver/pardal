import type { Money } from "../time.js";

/** Revenue streams (minimal for the slice), all integer currency units. */
export interface RevenueModel {
  readonly matchdayPerHomeGame: Money; // f(reputation, division)
  readonly tvPerRound: Money; // f(division)
  /** Prize by FINAL league position (index 0 = 1st), paid at season end. */
  readonly prizeMoneyByFinalPosition: readonly Money[];
}

/** A club's finances. `balance` is cash on hand; budgets are soft caps. */
export interface Finance {
  balance: Money;
  wageBudgetPerPeriod: Money;
  transferBudget: Money;
  readonly revenue: RevenueModel;
}

/** Wages are stored MONTHLY; fixtures settle per round (~a week). */
export const MONTH_DAYS = 30;
export const ROUND_DAYS = 7;

/** The share of a monthly wage bill charged when a match round is settled. */
export function wagesPerRound(monthlyBill: Money): Money {
  return Math.round(monthlyBill * (ROUND_DAYS / MONTH_DAYS));
}

/**
 * The share of a club's cash it is willing to commit to fees in a season.
 *
 * Was 0.4, which given `balance` starts at twelve weeks of wages made a budget of about
 * 1.1x the monthly wage bill — enough for a squad player and not for a signing anybody
 * would notice. Worth being clear about what raising it does and does not fix: measured,
 * the median club could already afford the median player fourteen times over, so
 * affordability was NEVER why the market was quiet (it was quiet because nothing called
 * it). This buys ambition at the top of the market, not volume.
 */
const TRANSFER_BUDGET_SHARE = 0.9;

/**
 * A club's transfer budget for a season: a share of its cash, scaled by a stable
 * per-club factor so two clubs with identical wage bills do not behave identically.
 *
 * The factor is derived from the career seed and the club id rather than drawn from a
 * generator, which matters because this is recomputed every rollover — a draw would give
 * the same club a different appetite each season for no reason, and would depend on the
 * order clubs happened to be processed in.
 */
export function seasonTransferBudget(careerSeed: number, clubId: string, balance: Money): Money {
  // FNV-1a over the club id, mixed with the career seed. Integer-only, so it is
  // identical everywhere.
  let hash = 0x811c9dc5 ^ (careerSeed >>> 0);
  for (let i = 0; i < clubId.length; i++) {
    hash = Math.imul(hash ^ clubId.charCodeAt(i), 0x01000193) >>> 0;
  }
  // 0.75 … 1.40: enough that a big-spending club is visibly bolder than a cautious one,
  // not so much that it swamps the difference in their actual means.
  const factor = 0.75 + (hash % 66) / 100;
  return Math.max(0, Math.round(balance * TRANSFER_BUDGET_SHARE * factor));
}

/** Sum of a squad's wages for one pay period. */
export function totalWageBill(wages: readonly Money[]): Money {
  let sum = 0;
  for (const w of wages) sum += w;
  return sum;
}
