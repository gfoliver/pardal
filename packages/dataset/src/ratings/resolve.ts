import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { REQUIRED_LABELS } from "./attributes.js";
import type { RatingsStore } from "./store.js";

/**
 * Matching a scraped ratings dump onto our players.
 *
 * Pure over (snapshot, dump) apart from writing into the store, so the join rule can be changed
 * and re-run without touching the network.
 */

/** One row of the dump, as the scraper emits it. */
export interface ScrapedPlayer {
  /** Our club id, when the scraper knew which club page the row came from. */
  readonly tm?: string;
  /** The source's own player id. */
  readonly uid: string;
  readonly name: string;
  /** The source's labels on its own scale. */
  readonly attrs: Record<string, number>;
}

export interface ResolveOutcome {
  readonly matched: number;
  readonly byClubName: number;
  readonly byUniqueName: number;
  readonly notInDump: number;
  /** Rows found but refused because the position's labels were not all present. */
  readonly incomplete: number;
}

/**
 * A fixed timestamp, because the pipeline must be reproducible.
 *
 * `new Date()` here would make every re-run produce a different `ratings.json` and so a different
 * artifact hash, for no information gain — the file records WHICH source and version, which is
 * the part that matters.
 */
export const FIXED_STAMP = "2026-08-03T00:00:00.000Z";

/** Accent-stripped, punctuation-free, lowercased — the join key between two sources. */
export const nameKey = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Resolve every player in the snapshot against the dump.
 *
 * Club-scoped name match FIRST. A bare name match is not safe on Brazilian squads — they are full
 * of shared first names, and matching "Paulinho" globally would pair our Palmeiras forward with
 * whichever Paulinho the source happened to list first. A cross-club match is allowed only when
 * the name is unique across the entire dump, which covers players who moved between the snapshot
 * and the scrape without ever guessing between namesakes.
 */
export function resolveScrapedRatings(
  snapshot: RawSnapshot,
  dump: readonly ScrapedPlayer[],
  store: RatingsStore,
  stamp: string = FIXED_STAMP,
): ResolveOutcome {
  const byClub = new Map<string, Map<string, ScrapedPlayer>>();
  const byName = new Map<string, ScrapedPlayer[]>();
  for (const p of dump) {
    const k = nameKey(p.name);
    if (p.tm) {
      const m = byClub.get(p.tm) ?? new Map<string, ScrapedPlayer>();
      m.set(k, p);
      byClub.set(p.tm, m);
    }
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }

  let byClubName = 0;
  let byUniqueName = 0;
  let notInDump = 0;
  let incomplete = 0;

  for (const p of snapshot.players) {
    const k = nameKey(p.name);
    let hit = byClub.get(p.clubId)?.get(k);
    let method = "club+name";
    if (!hit) {
      const cands = byName.get(k);
      if (cands?.length === 1) {
        hit = cands[0];
        method = "unique-name";
      }
    }
    if (!hit) {
      store.miss(p.id, stamp);
      notInDump++;
      continue;
    }
    /*
     * The labels a row must carry depend on whether the player keeps goal, because the source
     * publishes different sets: an outfielder has no Reflexes or Command of Area, and a keeper
     * has no Crossing, Finishing, Tackling or Marking at all.
     *
     * Demanding the outfield set from everybody rejected all 65 goalkeepers in the league on the
     * first run — they looked like bad scrapes when they were complete keeper pages.
     */
    const required = /goalkeeper/i.test(p.position ?? "") ? REQUIRED_LABELS.goalkeeper : REQUIRED_LABELS.outfield;
    const absent = required.filter((l) => typeof hit!.attrs[l] !== "number");
    if (absent.length > 0) {
      // A genuinely incomplete row is a bad scrape, not a player without those skills, so he is
      // recorded as a miss and keeps his inferred attributes.
      store.miss(p.id, stamp);
      incomplete++;
      continue;
    }
    store.match(p.id, { attributes: hit.attrs, sourceId: hit.uid, method, fetchedAt: stamp });
    if (method === "club+name") byClubName++;
    else byUniqueName++;
  }

  return { matched: byClubName + byUniqueName, byClubName, byUniqueName, notInDump, incomplete };
}
