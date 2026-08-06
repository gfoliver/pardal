import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { datasetContentHash } from "./contentHash.js";
import { runPipeline } from "../pipeline.js";
import type { ApplyReport, RatedPlayer } from "../ratings/apply.js";
import type { ValidationReport } from "../validate/Validate.js";
import { ARTIFACT_FILES, type DatasetArtifact, type DatasetManifest, type SourceRef } from "./DatasetArtifact.js";

/**
 * fs read/write of the artifact directory layout. IMPURE — used only by the
 * on-demand CLI and the app layer, never by the engine/career at runtime.
 */

const TM_ATTRIBUTION =
  "Data derived from Transfermarkt (community API). Personal, non-commercial use. Transfermarkt trademarks belong to their owners.";

/**
 * TheSportsDB asks that its data not be passed off as your own and that you
 * link back. Their terms also restrict app-store publication to paid keys, so
 * this string travels with any artifact their data touched.
 */
export const TSDB_ATTRIBUTION =
  "Player portraits and club identity data from TheSportsDB (https://www.thesportsdb.com). Free-tier key: personal, non-commercial use.";

/**
 * The ratings layer's own line. FMInside publishes a community Football Manager database; the
 * attributes are theirs and the mapping onto our model is ours, and both halves of that belong in
 * the string so an artifact is self-describing about where its player ratings came from.
 */
export const FMINSIDE_ATTRIBUTION =
  "Player attributes derived from the community Football Manager database at FMInside (https://fminside.net), remapped onto this project's own attribute model and scale. Personal, non-commercial use. Football Manager is a trademark of Sports Interactive/SEGA.";

/** Attribution for the sources an artifact actually drew on. */
function attributionFor(sources: readonly SourceRef[]): string {
  const lines = [TM_ATTRIBUTION];
  if (sources.some((s) => s.id === "thesportsdb")) lines.push(TSDB_ATTRIBUTION);
  if (sources.some((s) => s.id === "fminside")) lines.push(FMINSIDE_ATTRIBUTION);
  return lines.join(" ");
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Run the pure pipeline and package the result with a manifest.
 *
 * `effective` is the snapshot the PIPELINE sees — `snapshot` plus any enrichment
 * folded in. `artifact.raw` is always the pristine `snapshot`, because
 * `writeArtifact` persists it back over `raw.json`: emitting the merged version
 * would fold the enrichment layer into the squad layer, and the next
 * Transfermarkt re-scrape would then look like it had lost data.
 */
export async function buildArtifact(
  snapshot: RawSnapshot,
  opts: {
    name: string;
    slug: string;
    sources: readonly SourceRef[];
    datasetVersion?: string;
    note?: string;
    effective?: RawSnapshot;
    /** Real ratings by OUR player id; where present they replace inference. */
    ratings?: ReadonlyMap<string, RatedPlayer>;
  },
): Promise<{ artifact: DatasetArtifact; report: ValidationReport; ratings?: ApplyReport }> {
  const { league, world, evidence, report, ratings } = runPipeline(opts.effective ?? snapshot, opts.ratings);
  const manifest: DatasetManifest = {
    id: league.id,
    name: opts.name,
    slug: opts.slug,
    competition: snapshot.primaryCompetitionId,
    datasetVersion: opts.datasetVersion ?? "1",
    // Async only for this: the digest is WebCrypto, which is the one hash implementation available
    // unchanged in Node, a browser and workerd — and everybody computing it identically is the point.
    contentHash: await datasetContentHash({ league, world }),
    sources: opts.sources,
    counts: { competitions: snapshot.competitions.length, clubs: world.clubs.length, players: snapshot.players.length },
    attribution: attributionFor(opts.sources),
    note: opts.note,
  };
  return { artifact: { manifest, raw: snapshot, league, world, evidence }, report, ratings };
}

/**
 * Persist a full artifact to `<outDir>/<slug>/` — including the RAW snapshot and
 * the evidence sidecar, which are inputs and provenance rather than things the
 * game reads. Returns the directory path.
 *
 * Note it never writes `enrichment.json`: that file belongs to the `enrich`
 * command alone, and a build overwriting it would defeat the whole point of
 * keeping the two layers apart.
 */
export function writeArtifact(outDir: string, artifact: DatasetArtifact): string {
  const dir = writeConsumable(outDir, artifact);
  writeJson(join(dir, ARTIFACT_FILES.raw), artifact.raw);
  writeJson(join(dir, ARTIFACT_FILES.evidence), artifact.evidence);
  return dir;
}

/**
 * Write only the three files an app actually bundles. `raw.json` is ~10x the
 * size of what the game reads, so the app's copy of a dataset gets this subset.
 */
export function writeConsumable(outDir: string, artifact: DatasetArtifact): string {
  const dir = join(outDir, artifact.manifest.slug);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, ARTIFACT_FILES.manifest), artifact.manifest);
  writeJson(join(dir, ARTIFACT_FILES.league), artifact.league);
  writeJson(join(dir, ARTIFACT_FILES.world), artifact.world);
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
