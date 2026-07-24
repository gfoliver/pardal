/**
 * Canonical vocabulary for the (dormant) advanced-stats tier. When an
 * `AdvancedStatsSource` is plugged in, its per-90 metrics are addressed by
 * these stable keys so inference formulas don't depend on a source's naming.
 * The basic tier (goals/assists/cards/minutes/market value) is modelled
 * explicitly on `NormalizedPlayer` and needs no vocabulary.
 */
export const ADVANCED_METRICS = [
  "passAccuracy",
  "progressivePasses",
  "longPasses",
  "keyPasses",
  "takeOnsSucc",
  "progressiveCarries",
  "ballControl",
  "tackles",
  "interceptions",
  "blocks",
  "clearances",
  "aerialsWonPct",
  "xG",
  "xA",
  "savePct",
  "psxgPlusMinus",
] as const;

export type AdvancedMetric = (typeof ADVANCED_METRICS)[number];
