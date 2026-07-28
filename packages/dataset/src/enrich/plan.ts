import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { DEPTH_RANK, hasPhoto, hasPhysicals, type EnrichDepth, type EnrichmentFile } from "./Enrichment.js";

/**
 * Deciding WHAT still needs fetching is pure — no network, no clock — so the
 * resume behaviour that makes a twenty-minute job restartable can be tested on
 * fixtures instead of trusted.
 */

export interface PlanOptions {
  /** Follow name matches up with a single-entity lookup to get height/weight. */
  readonly deep?: boolean;
  /** Re-query entities previously recorded as absent from the source. */
  readonly retryMisses?: boolean;
  /**
   * Re-query every player we still have no portrait for, whether that is
   * because they were never found or because the record that matched carried no
   * image. Narrower than a full rebuild and aimed at the gap that shows.
   */
  readonly retryPhotoless?: boolean;
  /** Cap the work for this run so a long job can be done in chunks. */
  readonly max?: number;
  /** Refetch records produced by an enricher older than this. */
  readonly sourceVersion?: string;
}

export interface PlannedPlayer {
  readonly id: string;
  readonly depth: EnrichDepth;
}

export interface WorkPlan {
  readonly clubs: readonly string[];
  readonly players: readonly PlannedPlayer[];
  readonly skipped: {
    readonly alreadyDone: number;
    readonly knownMisses: number;
  };
  /** Work that exists but didn't fit under `max` — what a next run would pick up. */
  readonly deferred: number;
}

/**
 * The work still outstanding for a snapshot, given what's already cached.
 *
 * Entities are walked in a stable id order and the cap is applied last, so
 * running with `--max` repeatedly marches through the backlog deterministically
 * rather than re-rolling which entities get done.
 */
export function planWork(snapshot: RawSnapshot, enrichment: EnrichmentFile, opts: PlanOptions = {}): WorkPlan {
  let alreadyDone = 0;
  let knownMisses = 0;

  const clubs: string[] = [];
  for (const club of [...snapshot.clubs].sort(byId)) {
    const rec = enrichment.clubs[club.id];
    if (!rec || stale(rec.sourceVersion, opts.sourceVersion)) {
      clubs.push(club.id);
      continue;
    }
    if (rec.status === "notFound") {
      if (opts.retryMisses) clubs.push(club.id);
      else knownMisses++;
      continue;
    }
    alreadyDone++;
  }

  const players: PlannedPlayer[] = [];
  for (const player of [...snapshot.players].sort(byId)) {
    const rec = enrichment.players[player.id];
    if (!rec || stale(rec.sourceVersion, opts.sourceVersion)) {
      players.push({ id: player.id, depth: "roster" });
      continue;
    }
    // Asked for explicitly, and it cuts across status: a matched record whose
    // source entry simply had no image is as photoless as one never found.
    if (opts.retryPhotoless && !hasPhoto(rec)) {
      players.push({ id: player.id, depth: "roster" });
      continue;
    }
    if (rec.status === "notFound") {
      if (opts.retryMisses) players.push({ id: player.id, depth: "roster" });
      else knownMisses++;
      continue;
    }
    // Matched, but a shallow pass produced it: only a deep run tops it up, and
    // only when the physicals are actually still missing.
    if (opts.deep && DEPTH_RANK[rec.depth] < DEPTH_RANK.deep && !hasPhysicals(rec)) {
      players.push({ id: player.id, depth: "deep" });
      continue;
    }
    alreadyDone++;
  }

  const total = clubs.length + players.length;
  if (opts.max === undefined || total <= opts.max) {
    return { clubs, players, skipped: { alreadyDone, knownMisses }, deferred: 0 };
  }

  // Clubs first: a player can only be matched once its club is, so spending the
  // budget on clubs unblocks the most work on the next run.
  const cappedClubs = clubs.slice(0, opts.max);
  const cappedPlayers = players.slice(0, Math.max(0, opts.max - cappedClubs.length));
  return {
    clubs: cappedClubs,
    players: cappedPlayers,
    skipped: { alreadyDone, knownMisses },
    deferred: total - cappedClubs.length - cappedPlayers.length,
  };
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A record from an older enricher is refetched — its shape may have changed. */
function stale(recordVersion: string, current?: string): boolean {
  return current !== undefined && recordVersion !== current;
}
