import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyEnrichment,
  ENRICHMENT_FILE,
  type ClubEnrichment,
  type EnrichDepth,
  type EnrichmentFile,
  type EnrichmentRecord,
  type PlayerEnrichment,
} from "./Enrichment.js";

/**
 * Read/write access to the enrichment layer, with periodic flushing.
 *
 * The flush matters: a full run is hundreds of rate-limited requests over ~20
 * minutes, and a Ctrl-C or a run of 502s must not throw that away. Writing
 * every N records means the worst case is losing a handful of calls, and the
 * next run simply picks up from what's on disk.
 */
export class EnrichmentStore {
  private clubs: Record<string, EnrichmentRecord<ClubEnrichment>>;
  private players: Record<string, EnrichmentRecord<PlayerEnrichment>>;
  private dirty = 0;

  constructor(
    private readonly path: string,
    private readonly source: string,
    private readonly version: string,
    private readonly flushEvery = 20,
  ) {
    const loaded = readEnrichment(path);
    this.clubs = { ...(loaded?.clubs ?? {}) };
    this.players = { ...(loaded?.players ?? {}) };
  }

  snapshot(): EnrichmentFile {
    return { source: this.source, version: this.version, clubs: { ...this.clubs }, players: { ...this.players } };
  }

  club(id: string): EnrichmentRecord<ClubEnrichment> | undefined {
    return this.clubs[id];
  }

  putClub(id: string, rec: Omit<EnrichmentRecord<ClubEnrichment>, "sourceVersion">): void {
    this.clubs[id] = { ...rec, sourceVersion: this.version };
    this.touch();
  }

  putPlayer(id: string, rec: Omit<EnrichmentRecord<PlayerEnrichment>, "sourceVersion">): void {
    this.players[id] = { ...rec, sourceVersion: this.version };
    this.touch();
  }

  /**
   * Record an attempt that found nothing.
   *
   * A previously MATCHED record keeps its data. Re-query passes (`--retry-misses`,
   * `--missing-photos`) ask about players we already know something about, and a
   * search that misses this time — a roster window that shifted, a name lookup
   * that came back empty — is not evidence that what we hold is wrong. Only the
   * timestamp moves.
   */
  missPlayer(id: string, fetchedAt: string): void {
    const prev = this.players[id];
    this.players[id] =
      prev?.status === "matched"
        ? { ...prev, fetchedAt }
        : { status: "notFound", depth: "name", fetchedAt, sourceVersion: this.version };
    this.touch();
  }

  /** Merge new facts into an existing record without losing the deeper ones. */
  mergePlayer(id: string, data: PlayerEnrichment, depth: EnrichDepth, sourceId: string, fetchedAt: string): void {
    const prev = this.players[id];
    const merged: PlayerEnrichment = { ...prev?.data, ...stripUndefined(data) };
    this.players[id] = { status: "matched", data: merged, sourceId, depth, fetchedAt, sourceVersion: this.version };
    this.touch();
  }

  private touch(): void {
    if (++this.dirty >= this.flushEvery) this.flush();
  }

  flush(): void {
    if (this.dirty === 0) return;
    writeEnrichment(this.path, this.snapshot());
    this.dirty = 0;
  }
}

/** An absent or unreadable file is simply "nothing cached yet", never fatal. */
export function readEnrichment(path: string): EnrichmentFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<EnrichmentFile>;
    if (!parsed || typeof parsed !== "object") return undefined;
    return {
      source: parsed.source ?? "unknown",
      version: parsed.version ?? "0",
      clubs: parsed.clubs ?? {},
      players: parsed.players ?? {},
    };
  } catch {
    return undefined;
  }
}

export function writeEnrichment(path: string, file: EnrichmentFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sortFile(file), null, 2)}\n`);
}

export function enrichmentPath(datasetDir: string): string {
  return join(datasetDir, ENRICHMENT_FILE);
}

/** Stable key order so a re-run produces a diffable file, not a reshuffled one. */
function sortFile(file: EnrichmentFile): EnrichmentFile {
  const sorted = <T>(rec: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { source: file.source, version: file.version, clubs: sorted(file.clubs), players: sorted(file.players) };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function loadEnrichmentFor(datasetDir: string): EnrichmentFile | undefined {
  return readEnrichment(enrichmentPath(datasetDir));
}

export { emptyEnrichment, ENRICHMENT_FILE };
