/**
 * The enrichment LAYER: a second, independently-cached body of facts about the
 * entities in a RAW snapshot, keyed by OUR ids.
 *
 * It is deliberately a separate file from `raw.json` so that re-scraping the
 * squad source (Transfermarkt) cannot invalidate work that took twenty minutes
 * of rate-limited requests to gather. `build` reads it and never writes it;
 * `enrich` writes it and never touches `raw.json`.
 *
 * Records carry a STATUS, not just data: a player the source genuinely doesn't
 * have is remembered as a miss, so a resumed run skips them instead of
 * re-querying forever. `depth` records how much we asked for, so a later,
 * deeper pass can top a record up without redoing the cheap part.
 */

/**
 * How a record was obtained, cheapest first:
 * - `roster`: from a club's squad listing — the full source record.
 * - `name`:   from a by-name search — identity + photo, but no physicals.
 * - `deep`:   a follow-up single-entity lookup, which fills the physicals.
 */
export type EnrichDepth = "roster" | "name" | "deep";

/** Filename of the layer inside a dataset directory, beside `raw.json`. */
export const ENRICHMENT_FILE = "enrichment.json";

export const DEPTH_RANK: Readonly<Record<EnrichDepth, number>> = { name: 1, roster: 2, deep: 3 };

export interface ClubEnrichment {
  readonly city?: string;
  readonly stadium?: string;
  readonly capacity?: number;
  readonly foundedYear?: number;
  readonly country?: string;
  readonly colours?: readonly string[];
  readonly badgeUrl?: string;
}

export interface PlayerEnrichment {
  readonly photo?: string;
  readonly photoCutout?: string;
  readonly birthDate?: string;
  readonly heightCm?: number;
  readonly weightKg?: number;
  readonly shirtNumber?: number;
  readonly birthPlace?: string;
  readonly nationality?: string;
  /** The source's own position label, kept as a second opinion. */
  readonly position?: string;
}

export interface EnrichmentRecord<T> {
  readonly status: "matched" | "notFound";
  readonly data?: T;
  /** The source's id for this entity — traceability, and a cheap re-lookup key. */
  readonly sourceId?: string;
  readonly depth: EnrichDepth;
  readonly fetchedAt: string;
  readonly sourceVersion: string;
}

export interface EnrichmentFile {
  readonly source: string;
  readonly version: string;
  readonly clubs: Readonly<Record<string, EnrichmentRecord<ClubEnrichment>>>;
  readonly players: Readonly<Record<string, EnrichmentRecord<PlayerEnrichment>>>;
}

export function emptyEnrichment(source: string, version: string): EnrichmentFile {
  return { source, version, clubs: {}, players: {} };
}

/** True when the record already carries the physical attributes a deep pass adds. */
export function hasPhysicals(rec: EnrichmentRecord<PlayerEnrichment>): boolean {
  return rec.data?.heightCm !== undefined || rec.data?.weightKg !== undefined;
}

/**
 * True when we already have a portrait. The photo is the single most visible
 * thing this layer contributes, so "everything still missing a photo" is a
 * worthwhile unit of work in its own right — see `retryPhotoless`.
 */
export function hasPhoto(rec: EnrichmentRecord<PlayerEnrichment>): boolean {
  return rec.data?.photo !== undefined;
}
