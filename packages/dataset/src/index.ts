// @fut/dataset — on-demand ETL that assembles a personal football dataset from
// community sources and emits a portable artifact a career is built on.
//
// Layers: Sources (Extract, impure) → Normalize → Infer → Validate → Emit.
// Everything below Extract is pure and deterministic over an immutable RAW
// snapshot, so the same snapshot always reproduces the same dataset.

export * from "./raw/RawSnapshot.js";
export type { Source } from "./sources/Source.js";
export { toDomainPosition } from "./mapping/position.js";
export { normalizeSnapshot, birthYearOf, isoBirthDate, seasonYearOf, type NormalizedPlayer } from "./normalize/Normalize.js";
export { clubKits } from "./mapping/clubKits.js";
// The enrichment layer: a second body of facts, cached beside the RAW snapshot
// and folded in at build time. Pure parts only — the fetching lives in sources/.
export {
  type ClubEnrichment,
  type EnrichDepth,
  type EnrichmentFile,
  type EnrichmentRecord,
  type PlayerEnrichment,
  emptyEnrichment,
  ENRICHMENT_FILE,
} from "./enrich/Enrichment.js";
export { planWork, type PlanOptions, type WorkPlan } from "./enrich/plan.js";
export { enrichmentToPartial } from "./enrich/enrichmentToPartial.js";
export { type Attribute, type AttributeSource } from "./infer/Attribute.js";
export { inferPlayer, inferCoach, type InferredPlayer, type InferredCoach } from "./infer/InferAttributes.js";
export { targetOverall } from "./infer/formulas.js";
export { validate, type ValidationReport } from "./validate/Validate.js";
export { emit, type EmitResult, type EvidenceSidecar } from "./emit/Emit.js";
export { runPipeline, type PipelineResult } from "./pipeline.js";
export {
  type DatasetArtifact,
  type DatasetManifest,
  type SourceRef,
  ARTIFACT_FILES,
} from "./artifact/DatasetArtifact.js";
// Node-only helpers (fs/network) are imported directly from their modules, not
// re-exported here, so this entrypoint stays safe to import in the browser:
//   store.ts (buildArtifact/writeArtifact/loadArtifact), cli.ts, sources/*.

