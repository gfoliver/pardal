import { clampAttribute } from "@fut/domain";

/**
 * How an attribute's value was obtained (provenance).
 *
 * Exactly the three that occur, and the union was wrong before this. It listed `"ml"`, `"llm"` and
 * `"manual"` — none of which anything ever wrote — and had no member for the commonest case of all,
 * an attribute nobody measured that was filled in from what the position implies. So
 * `positionShape` labelled position priors `"manual"`, which claims a human typed a number that no
 * human has ever seen, and a test that wanted to say "this is a guess" had to write `"prior"` and
 * be excluded from typechecking to get away with it. The test was right and the type was wrong.
 *
 * Only ONE reader cares about the value: `applyRatings` measures the distribution of the attributes
 * that came from the source, by matching `"community"`. Everything else writes a label for the
 * evidence sidecar so a rating can be traced back.
 */
export type AttributeSource =
  /** Derived from the player's own match statistics. */
  | "stats"
  /**
   * Nobody measured this. It is what the position implies, at low confidence — a striker's marking,
   * an outfielder's goalkeeping, a generated coach's tactical numbers. The UI leans on the low
   * confidence to avoid presenting a guess as a fact.
   */
  | "prior"
  /** Taken from a community-maintained database — currently FMInside. */
  | "community";

/**
 * A single derived attribute with provenance. The engine consumes only
 * `.value`; `.confidence` (0..1) and `.source` are kept in the evidence sidecar
 * so a dataset is traceable and can be regenerated when formulas improve.
 */
export interface Attribute {
  readonly value: number;
  readonly confidence: number;
  readonly source: AttributeSource;
}

export function attr(value: number, confidence: number, source: AttributeSource): Attribute {
  return { value: clampAttribute(Math.round(value)), confidence: Math.max(0, Math.min(1, confidence)), source };
}

/** Nudge an attribute's value, raising confidence and re-sourcing it. */
export function perturb(a: Attribute, delta: number, confidence: number, source: AttributeSource = "stats"): Attribute {
  if (delta === 0) return a;
  return attr(a.value + delta, Math.max(a.confidence, confidence), source);
}
