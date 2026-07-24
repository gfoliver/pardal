import type { RawSnapshot } from "./raw/RawSnapshot.js";
import { normalizeSnapshot } from "./normalize/Normalize.js";
import { inferPlayer } from "./infer/InferAttributes.js";
import { validate, type ValidationReport } from "./validate/Validate.js";
import { emit, type EmitResult } from "./emit/Emit.js";

export interface PipelineResult extends EmitResult {
  readonly report: ValidationReport;
}

/**
 * The PURE core: RAW snapshot → normalized → inferred → validated → emitted.
 * Deterministic (no I/O, no Date/random) — the same snapshot always produces
 * the same league/world/evidence. The impure Extract layer and fs writes live
 * only in the CLI.
 */
export function runPipeline(snapshot: RawSnapshot): PipelineResult {
  const normalized = normalizeSnapshot(snapshot);
  const inferred = normalized.map(inferPlayer);
  const report = validate(snapshot, inferred);
  return { ...emit(snapshot, inferred), report };
}
