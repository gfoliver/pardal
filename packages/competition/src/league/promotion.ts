import type { StandingRow } from "./Standings.js";

export interface PromotionRules {
  readonly promotionSlots: number;
  readonly relegationSlots: number;
}

export interface PromotionResult {
  /** Team ids finishing in the promotion places (top of the table). */
  readonly promoted: string[];
  /** Team ids finishing in the relegation places (bottom of the table). */
  readonly relegated: string[];
}

/**
 * Resolve promotion/relegation from a FINAL table. Pure: `table` is assumed
 * already sorted best→worst (as `computeStandings` returns). Slots are clamped
 * so they can't overlap on small tables.
 */
export function resolvePromotionRelegation(table: readonly StandingRow[], rules: PromotionRules): PromotionResult {
  const n = table.length;
  const up = Math.max(0, Math.min(rules.promotionSlots, n));
  const down = Math.max(0, Math.min(rules.relegationSlots, n - up));
  return {
    promoted: table.slice(0, up).map((r) => r.teamId),
    relegated: down > 0 ? table.slice(n - down).map((r) => r.teamId) : [],
  };
}
