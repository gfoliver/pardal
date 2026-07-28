import type { RawSnapshot } from "./raw/RawSnapshot.js";
import { normalizeSnapshot } from "./normalize/Normalize.js";
import { inferPlayer } from "./infer/InferAttributes.js";
import { validate, type ValidationReport } from "./validate/Validate.js";
import { emit, type EmitResult } from "./emit/Emit.js";
import { applyPesRatings, type ApplyReport, type PesRatedPlayer } from "./pes/applyRatings.js";

export interface PipelineResult extends EmitResult {
  readonly report: ValidationReport;
  /** How many players got real ratings, and how the rest were placed. */
  readonly ratings?: ApplyReport;
}

/**
 * The PURE core: RAW snapshot → normalized → inferred → validated → emitted.
 * Deterministic (no I/O, no Date/random) — the same snapshot always produces
 * the same league/world/evidence. The impure Extract layer and fs writes live
 * only in the CLI.
 */
export function runPipeline(
  snapshot: RawSnapshot,
  /**
   * Real ratings, keyed by OUR player id. Where present they REPLACE the inferred
   * attributes and drag everyone else onto the same scale — see
   * `pes/applyRatings`. Absent, the pipeline behaves exactly as before.
   */
  ratings?: ReadonlyMap<string, PesRatedPlayer>,
): PipelineResult {
  const normalized = normalizeSnapshot(snapshot);
  const guessed = normalized.map(inferPlayer);
  const { players: inferred, report: ratingsReport } = ratings?.size
    ? applyPesRatings(guessed, ratings)
    : { players: guessed, report: undefined };
  const report = validate(snapshot, inferred);
  return { ...emit(snapshot, inferred), report, ratings: ratingsReport };
}
