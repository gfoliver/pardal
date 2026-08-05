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
  /**
   * The source's age for him, when the scraper captured it.
   *
   * The only thing that separates namesakes. Brazilian squads are full of shared short names — Ryan,
   * Vitinho, Rodriguinho, Pedro Henrique — and measured on one division, 38 of our players were present
   * in the dump under a name it shared with someone else and had to be refused. Optional, so a dump
   * collected before this existed resolves exactly as it used to.
   */
  readonly age?: number;
  /** The source's labels on its own scale. */
  readonly attrs: Record<string, number>;
}

/**
 * How far apart two ages may be and still be one person.
 *
 * One year, because the two sources are snapshots taken on different dates and a birthday in between
 * moves the number. Wider would start accepting the namesake it is here to exclude.
 */
const AGE_TOLERANCE = 1;

const ageAgrees = (ours: number | undefined, theirs: number | undefined): boolean =>
  ours !== undefined && theirs !== undefined && Math.abs(ours - theirs) <= AGE_TOLERANCE;

/**
 * One candidate, or none.
 *
 * A single candidate is taken as-is. Several are decided by age, and ONLY when exactly one age agrees:
 * two candidates of the same age under the same name cannot be told apart, and picking either would be
 * a guess dressed as a match. A dump with no ages behaves exactly as before — ambiguity is refused.
 */
function pick(cands: readonly ScrapedPlayer[], ourAge: number | undefined): ScrapedPlayer | undefined {
  if (cands.length <= 1) return cands[0];
  const agreeing = cands.filter((c) => ageAgrees(ourAge, c.age));
  return agreeing.length === 1 ? agreeing[0] : undefined;
}

export interface ResolveOutcome {
  readonly matched: number;
  readonly byClubName: number;
  readonly byUniqueName: number;
  /** Matched only because the ages agreed — a name shared with someone else in the dump. */
  readonly byNameAndAge: number;
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
  /*
   * A LIST per (club, name), not one entry.
   *
   * It used to be `map.set(name, player)`, so two namesakes at the same club collapsed and whichever
   * the dump listed last silently won. Keeping both means `pick` can decide on age — or refuse, which
   * is the honest outcome when it cannot.
   */
  const byClub = new Map<string, Map<string, ScrapedPlayer[]>>();
  const byName = new Map<string, ScrapedPlayer[]>();
  for (const p of dump) {
    const k = nameKey(p.name);
    if (p.tm) {
      const m = byClub.get(p.tm) ?? new Map<string, ScrapedPlayer[]>();
      m.set(k, [...(m.get(k) ?? []), p]);
      byClub.set(p.tm, m);
    }
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }

  let byClubName = 0;
  let byUniqueName = 0;
  let byNameAndAge = 0;
  let notInDump = 0;
  let incomplete = 0;

  for (const p of snapshot.players) {
    const k = nameKey(p.name);
    let hit = pick(byClub.get(p.clubId)?.get(k) ?? [], p.age);
    let method = "club+name";
    if (!hit) {
      const cands = byName.get(k) ?? [];
      hit = pick(cands, p.age);
      // Separate names for separate evidence: one candidate is a unique name, several decided by age is
      // a weaker claim, and a report that called both "unique" would hide how much work age is doing.
      method = cands.length === 1 ? "unique-name" : "name+age";
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
    else if (method === "unique-name") byUniqueName++;
    else byNameAndAge++;
  }

  return {
    matched: byClubName + byUniqueName + byNameAndAge,
    byClubName,
    byUniqueName,
    byNameAndAge,
    notInDump,
    incomplete,
  };
}
