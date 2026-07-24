import { clampAttribute } from "@fut/domain";

/** How an attribute's value was obtained (provenance). */
export type AttributeSource = "stats" | "ml" | "llm" | "manual" | "community";

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
