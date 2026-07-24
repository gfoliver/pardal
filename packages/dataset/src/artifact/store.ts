import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { runPipeline } from "../pipeline.js";
import type { ValidationReport } from "../validate/Validate.js";
import { ARTIFACT_FILES, type DatasetArtifact, type DatasetManifest, type SourceRef } from "./DatasetArtifact.js";

/**
 * fs read/write of the artifact directory layout. IMPURE — used only by the
 * on-demand CLI and the app layer, never by the engine/career at runtime.
 */

const TM_ATTRIBUTION =
  "Data derived from Transfermarkt (community API). Personal, non-commercial use. Transfermarkt trademarks belong to their owners.";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Run the pure pipeline over a snapshot and package it with a manifest. */
export function buildArtifact(
  snapshot: RawSnapshot,
  opts: { name: string; slug: string; sources: readonly SourceRef[]; datasetVersion?: string; note?: string },
): { artifact: DatasetArtifact; report: ValidationReport } {
  const { league, world, evidence, report } = runPipeline(snapshot);
  const manifest: DatasetManifest = {
    id: league.id,
    name: opts.name,
    slug: opts.slug,
    competition: snapshot.primaryCompetitionId,
    datasetVersion: opts.datasetVersion ?? "1",
    sources: opts.sources,
    counts: { competitions: snapshot.competitions.length, clubs: world.clubs.length, players: snapshot.players.length },
    attribution: TM_ATTRIBUTION,
    note: opts.note,
  };
  return { artifact: { manifest, raw: snapshot, league, world, evidence }, report };
}

/** Persist an artifact to `<outDir>/<slug>/`. Returns the directory path. */
export function writeArtifact(outDir: string, artifact: DatasetArtifact): string {
  const dir = join(outDir, artifact.manifest.slug);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, ARTIFACT_FILES.manifest), artifact.manifest);
  writeJson(join(dir, ARTIFACT_FILES.raw), artifact.raw);
  writeJson(join(dir, ARTIFACT_FILES.league), artifact.league);
  writeJson(join(dir, ARTIFACT_FILES.world), artifact.world);
  writeJson(join(dir, ARTIFACT_FILES.evidence), artifact.evidence);
  return dir;
}

/** Read a persisted artifact directory back into memory. */
export function loadArtifact(dir: string): DatasetArtifact {
  return {
    manifest: readJson(join(dir, ARTIFACT_FILES.manifest)),
    raw: readJson(join(dir, ARTIFACT_FILES.raw)),
    league: readJson(join(dir, ARTIFACT_FILES.league)),
    world: readJson(join(dir, ARTIFACT_FILES.world)),
    evidence: readJson(join(dir, ARTIFACT_FILES.evidence)),
  };
}

/** Read just a snapshot's raw.json (for the `--from-raw` recompute path). */
export function loadRawSnapshot(path: string): RawSnapshot {
  return readJson<RawSnapshot>(path);
}
