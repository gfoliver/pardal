import type { RawSnapshot } from "../raw/RawSnapshot.js";
import type { EnrichmentFile } from "../enrich/Enrichment.js";
import type { WorkPlan } from "../enrich/plan.js";

/**
 * A second source that describes entities we ALREADY have, rather than
 * discovering new ones.
 *
 * This is a different job from `Source`, and the difference is the id space.
 * A `Source` invents its own ids; an `Enricher` must speak ours, because
 * `mergeSources` unions by id — a second source keyed on its own ids would
 * duplicate every club and player instead of enriching them. So an enricher
 * resolves entities itself and returns records keyed by the snapshot's ids.
 *
 * Implementations are IMPURE (network) and run only from the on-demand
 * `enrich` command, never at game runtime.
 */
export interface Enricher {
  readonly id: string;
  /** Bumped when the record shape changes, so cached records can be refetched. */
  readonly version: string;
  /**
   * Fetch exactly the work in `plan` and hand each result to `sink` as it
   * arrives — streaming rather than batching, so a long rate-limited run can be
   * flushed to disk periodically and resumed after an interruption.
   */
  run(snapshot: RawSnapshot, plan: WorkPlan, sink: EnrichSink, log?: (msg: string) => void): Promise<EnrichOutcome>;
}

/** Where an enricher deposits results as it goes. */
export interface EnrichSink {
  club(id: string, rec: ClubResult): void;
  player(id: string, rec: PlayerResult): void;
  /** Read back what is already known — lets a deep pass build on a shallow one. */
  current(): EnrichmentFile;
}

export interface ClubResult {
  readonly status: "matched" | "notFound";
  readonly sourceId?: string;
  readonly data?: EnrichmentFile["clubs"][string]["data"];
  readonly fetchedAt: string;
}

export interface PlayerResult {
  readonly status: "matched" | "notFound";
  readonly sourceId?: string;
  readonly data?: EnrichmentFile["players"][string]["data"];
  readonly depth: "roster" | "name" | "deep";
  readonly fetchedAt: string;
}

export interface EnrichOutcome {
  readonly requests: number;
  readonly clubsMatched: number;
  readonly clubsMissed: number;
  readonly playersMatched: number;
  readonly playersMissed: number;
  readonly ambiguous: readonly string[];
  readonly errors: readonly string[];
}
