/**
 * Display currency, chosen by the user like the language — INDEPENDENT of it.
 *
 * All money inside a save is stored in ONE canonical unit: the dataset's own
 * currency (`CareerState.currency`, BRL for the Brasileirão dataset). The engine
 * and the career never convert — integers stay exact and nothing drifts. The UI
 * converts base → display purely for presentation, so the whole interface reads
 * in a single currency whichever one you pick.
 *
 * Rates are STATIC (no network, keeps the app deterministic/offline); they are
 * approximate references, not live FX.
 */
export type CurrencyCode = "BRL" | "USD" | "EUR";

export const CURRENCIES: { id: CurrencyCode; label: string; symbol: string }[] = [
  { id: "BRL", label: "R$", symbol: "R$" },
  { id: "USD", label: "$", symbol: "$" },
  { id: "EUR", label: "€", symbol: "€" },
];

/** Units of each currency per 1 BRL (the canonical base of our datasets). */
const PER_BRL: Record<CurrencyCode, number> = {
  BRL: 1,
  USD: 1 / 5.4,
  EUR: 1 / 6.2,
};

/** Convert an amount from a save's base currency into the display currency. */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const inBrl = amount / PER_BRL[from];
  return inBrl * PER_BRL[to];
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.id === code)?.symbol ?? "$";
}
