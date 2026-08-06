import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { REQUIRED_LABELS, GK_SOURCE_LABELS } from "./attributes.js";
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
 * Do the two ages CONTRADICT each other? Not the same question as agreeing.
 *
 * Three states, and the middle one is why: they agree, they contradict, or one side has no age and there
 * is nothing to say. Absence of evidence is not evidence of absence — 86 of the 180 cross-club matches
 * have no age on one side, and refusing those would throw away real ratings to punish a gap in a source.
 *
 * A CONTRADICTION is different. It is a positive claim that this is not the same person, and the
 * measurement says it is the single most productive check available: of the 94 cross-club matches with
 * an age on both sides, 25 disagreed by more than a year and the gaps ran to thirteen years — our
 * 28-year-old Kevin matched to an 18-year-old. On the club-scoped path only 2 of 839 disagreed, and by
 * 2 and 3 years, so the same rule is applied to both paths rather than one tolerance per path: at a club
 * full of youth-team namesakes, a three-year gap is more likely two people than one bad birthday.
 */
const ageContradicts = (ours: number | undefined, theirs: number | undefined): boolean =>
  ours !== undefined && theirs !== undefined && Math.abs(ours - theirs) > AGE_TOLERANCE;

/**
 * One candidate, or none.
 *
 * A single candidate is taken as-is — the contradiction filter above has already removed anyone whose age
 * says he is not our man. Several are decided by age, and ONLY when exactly one age agrees: two
 * candidates of the same age under the same name cannot be told apart, and picking either would be a
 * guess dressed as a match. A dump with no ages refuses ambiguity, as it always did.
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
  /** Rows found but refused because the row describes somebody who does not play our man's position. */
  readonly wrongPosition: number;
  /** Rows found under his name but refused because the source's age contradicts ours. */
  readonly ageMismatch: number;
  /**
   * Absent from a dump that DID cover his club — so the dump says he is not there.
   *
   * Told apart from `notInDump` because only this one is evidence. A dump that never visited his club is
   * silent about him and must not delete an earlier match; a dump that walked his squad and did not list
   * him has answered the question.
   */
  readonly absentFromCoveredClub: number;
}

/**
 * The four goalkeeping labels, which are what tell a keeper's row from an outfielder's.
 *
 * The source publishes all 47 labels for every player, so the completeness check below cannot see a
 * mix-up: a row is "complete" whoever it belongs to. The VALUES can. FM rates an outfielder's Reflexes,
 * Handling, Command of Area and One on Ones at 1 to 3 — "not applicable" written as a number, the same
 * phenomenon `apply.ts` documents in the mirror direction — while a real keeper sits at 10 and up.
 */
const GK_LABELS = [...GK_SOURCE_LABELS];

/**
 * Does this row describe somebody who plays where our man plays?
 *
 * Only the keeper/outfielder split is checked, because that is the only one the data separates
 * cleanly. Measured over 1044 matched rows: our keepers' goalkeeping median runs 10 to 15 (5th
 * percentile 10), our outfielders' runs 1 to 3 (95th percentile 3). The threshold sits in an EMPTY
 * band — every value from 5 to 8 refuses exactly the same nine rows — so it is a separator rather than
 * a tuned constant.
 *
 * Outfielder-to-outfielder mix-ups are NOT guessed at, and that is a measurement rather than a shrug.
 * The obvious score — (Marking + Tackling)/2 minus (Finishing + Off the Ball)/2, how much more defensive
 * than attacking the row reads — was measured over the 929 outfield rows we believe: our defenders run
 * from -10 to +7.5 and our forwards from -9 to +10.5. The two populations overlap along almost their
 * whole range, so unlike the goalkeeping band there is no empty gap for a threshold to sit in. A cutoff
 * that catches the two known mix-ups (a winger holding a row scoring +9, a full-back holding one at -10)
 * lands one point away from a legitimate attacking full-back at -7 and a hard-working winger at +7.5 —
 * a tuned constant, not a separator, and it would refuse real players for every one it saved. The age
 * check below catches them instead, on evidence rather than on a shape.
 */
const KEEPER_ROW_MIN = 7;

/** Keeper, outfielder, or a row that cannot say — see `positionAgrees` for why the third matters. */
function keeperRow(attrs: Readonly<Record<string, number>>): boolean | undefined {
  const gk = GK_LABELS.map((l) => attrs[l]).filter((v): v is number => typeof v === "number");
  if (gk.length < GK_LABELS.length) return undefined;
  const sorted = [...gk].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]! >= KEEPER_ROW_MIN;
}

/**
 * Whether a candidate row can belong to a player in this position at all.
 *
 * A row MISSING the goalkeeping labels answers `true` — it is not evidence of the wrong person, and the
 * completeness check below is the one that should reject it. Returning false here instead put an
 * incomplete keeper's row in the "different kind of footballer" bucket and told three existing tests
 * that a bad scrape was a mismatched person. "Cannot tell" is not "wrong".
 */
function positionAgrees(position: string | undefined, attrs: Readonly<Record<string, number>>): boolean {
  const isKeeperRow = keeperRow(attrs);
  if (isKeeperRow === undefined) return true;
  return /goalkeeper/i.test(position ?? "") === isKeeperRow;
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
  let wrongPosition = 0;
  let ageMismatch = 0;
  let absentFromCoveredClub = 0;

  for (const p of snapshot.players) {
    const k = nameKey(p.name);
    /*
     * A candidate whose row belongs to a different KIND of footballer is not this player, so the search
     * carries on rather than settling. Measured, ten of the eleven absurdly-rated players in the
     * two-tier build were mix-ups of exactly this shape — four keepers of ours holding an outfielder's
     * row and six outfielders holding somebody else's, mostly a keeper's.
     *
     * That is why this task did not become a floor on the rating. A floor would have turned ten wrong
     * people into ten mediocre players and taken the evidence away: the absurd overall was the symptom
     * that made the bug visible at all.
     */
    const atClub = byClub.get(p.clubId)?.get(k) ?? [];
    const named = byName.get(k) ?? [];
    const agrees = (c: ScrapedPlayer) => positionAgrees(p.position, c.attrs) && !ageContradicts(p.age, c.age);
    let hit = pick(atClub.filter(agrees), p.age);
    let method = "club+name";
    if (!hit) {
      hit = pick(named.filter(agrees), p.age);
      /*
       * Counted on how many bore the NAME, not on how many survived the filters.
       *
       * Separate names for separate evidence: a genuinely unique name is one claim, and a name several
       * players share where the age or the row's own position eliminated the rest is a weaker one. Judging
       * this after filtering called the second kind "unique" — which is precisely the work being hidden,
       * since the filters are the evidence.
       */
      method = named.length === 1 ? "unique-name" : "name+age";
    }
    if (!hit) {
      /*
       * WHY he is unrated, told apart, because the reasons call for different responses.
       *
       * A JUDGEMENT — somebody of that name is in the dump and the evidence says he is not our man, or
       * the dump walked his squad and he was not in it — overwrites any earlier match. `miss` preserves
       * one deliberately, so a refusal routed through it would change nothing at all; that is exactly
       * what happened on the first pass, where twenty-seven bad matches were refused and every one stayed
       * in the file.
       *
       * NOT a judgement: a name that survived every check but lost to ambiguity, and a player absent from
       * a dump that never covered his club. The second is the distinction `miss` is really reaching for —
       * a partial dump is silent about him, and silence must not delete what a fuller dump found. Once
       * his club HAS been walked, absence is an answer.
       */
      const candidates = atClub.length > 0 ? atClub : named;
      const positionRefused = candidates.length > 0 && candidates.every((c) => !positionAgrees(p.position, c.attrs));
      const ageRefused = candidates.length > 0 && candidates.every((c) => ageContradicts(p.age, c.age));
      if (positionRefused || ageRefused) {
        store.reject(p.id, stamp);
        // Position first when both fire: it is a statement about the row's contents, which is the stronger
        // claim of the two, and double-counting would make the two columns add up to more than the
        // refusals.
        if (positionRefused) wrongPosition++;
        else ageMismatch++;
      } else if (candidates.length === 0 && byClub.has(p.clubId)) {
        store.reject(p.id, stamp);
        absentFromCoveredClub++;
      } else {
        store.miss(p.id, stamp);
        notInDump++;
      }
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
    wrongPosition,
    ageMismatch,
    absentFromCoveredClub,
  };
}
