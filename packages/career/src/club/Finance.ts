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

/** Sum of a squad's wages for one pay period. */
export function totalWageBill(wages: readonly Money[]): Money {
  let sum = 0;
  for (const w of wages) sum += w;
  return sum;
}
