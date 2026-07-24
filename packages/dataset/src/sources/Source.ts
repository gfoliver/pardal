import type { RawSnapshot } from "../raw/RawSnapshot.js";

/**
 * An Extract adapter: the ONLY impure edge of the pipeline. A source fetches
 * from a community provider (network I/O) and returns a partial RAW snapshot;
 * `mergeSources` unions several by entity id into the full snapshot the pure
 * pipeline consumes. Sources run only when the user invokes the assemble
 * command — never at game runtime.
 */
export interface Source {
  readonly id: string;
  readonly version: string;
  /**
   * Fetch everything the source can supply for a competition (its clubs,
   * squads, bio, market value, basic stats). `key` is the source's competition
   * code (e.g. "BRA1"). Cup competitions the clubs enter may be included too.
   */
  fetchCompetition(key: string, seasonId?: string): Promise<Partial<RawSnapshot>>;
}
