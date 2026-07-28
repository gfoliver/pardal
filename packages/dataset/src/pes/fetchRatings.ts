import { isoBirthDate } from "../normalize/Normalize.js";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { matchClub, matchPlayer, type ClubCandidate } from "../resolve/matchEntities.js";
import { clubOverride } from "../resolve/overrides.js";
import { toCandidate, type PesPlayer } from "../sources/PesRetroSource.js";
import type { PesStore } from "./store.js";

/**
 * Resolving the source's clubs and players onto ours.
 *
 * Reuses the shared resolver rather than growing a second one: the club names
 * differ ("Grêmio FBPA" against "Grêmio Foot-Ball Porto Alegrense", "Clube
 * Atlético Mineiro" against "Atlético Mineiro"), which is exactly the token-
 * subset problem it already solves — including the guard that keeps a women's or
 * under-20 side from matching the senior team.
 *
 * The club match is what makes the PLAYER match safe. Brazilian squads are full
 * of mononyms — three different "Hugo"s across the league — so name alone would
 * cheerfully attach one club's Hugo to another's. Matching the club first turns
 * the name into a within-squad question.
 */

export interface ResolveReport {
  readonly clubsMatched: number;
  readonly clubsMissed: readonly string[];
  readonly playersMatched: number;
  readonly playersMissed: number;
  readonly ambiguous: readonly string[];
}

export interface ResolveOptions {
  /** Our clubId → the source's club id, for the ones the rules can't get. */
  readonly clubOverrides?: Readonly<Record<string, string>>;
  readonly log?: (message: string) => void;
}

export function resolveRatings(
  snapshot: RawSnapshot,
  players: readonly PesPlayer[],
  store: PesStore,
  fetchedAt: string,
  opts: ResolveOptions = {},
): ResolveReport {
  const log = opts.log ?? (() => {});

  // --- clubs ---------------------------------------------------------------
  const teams = new Map<string, ClubCandidate>();
  for (const p of players) {
    if (p.team && !teams.has(p.team.sourceId)) teams.set(p.team.sourceId, { sourceId: p.team.sourceId, name: p.team.name });
  }
  const clubCandidates = [...teams.values()];
  const ourClubToSource = new Map<string, string>();
  const clubsMissed: string[] = [];
  for (const club of snapshot.clubs) {
    // A curated pin beats both the caller's map and the rules: those entries
    // exist precisely because a rule got it WRONG (see the Botafogo note).
    const pinned = clubOverride("pesretrostats", club.id) ?? opts.clubOverrides?.[club.id];
    const m = matchClub(club, clubCandidates, pinned);
    if (m && !("ambiguous" in m)) {
      ourClubToSource.set(club.id, m.candidate.sourceId);
      store.club(club.id, m.candidate.sourceId);
      log(`  club ${club.name} → ${m.candidate.name} (${m.method})`);
    } else {
      clubsMissed.push(club.name);
      log(`  club ${club.name} → NO MATCH${m && "ambiguous" in m ? " (ambiguous)" : ""}`);
    }
  }

  // --- players -------------------------------------------------------------
  const byClub = new Map<string, PesPlayer[]>();
  for (const p of players) {
    const key = p.team?.sourceId ?? "";
    const list = byClub.get(key);
    if (list) list.push(p);
    else byClub.set(key, [p]);
  }

  let matched = 0;
  let missed = 0;
  const ambiguous: string[] = [];
  for (const ours of snapshot.players) {
    const sourceClubId = ourClubToSource.get(ours.clubId);
    // Only ever consider the matched club's squad. Widening to the whole league
    // when a club is unmatched would trade a known gap for a silent wrong match.
    const pool = sourceClubId ? (byClub.get(sourceClubId) ?? []) : [];
    if (pool.length === 0) {
      store.miss(ours.id, fetchedAt);
      missed++;
      continue;
    }
    const birthDate = isoBirthDate(ours.dob);
    const m = matchPlayer(
      {
        id: ours.id,
        name: ours.name,
        expectedSourceClubId: sourceClubId,
        birthDate,
        birthYear: birthDate ? Number(birthDate.slice(0, 4)) : undefined,
      },
      pool.map(toCandidate),
    );
    if (!m || "ambiguous" in m) {
      if (m && "ambiguous" in m) ambiguous.push(ours.name);
      store.miss(ours.id, fetchedAt);
      missed++;
      continue;
    }
    const hit = pool.find((p) => p.sourceId === m.candidate.sourceId)!;
    store.match(ours.id, {
      ratings: hit.ratings,
      overall: hit.overall,
      position: hit.position,
      shirtNumber: hit.shirtNumber,
      sourceId: hit.sourceId,
      method: m.method,
      fetchedAt,
    });
    matched++;
  }

  return {
    clubsMatched: ourClubToSource.size,
    clubsMissed,
    playersMatched: matched,
    playersMissed: missed,
    ambiguous,
  };
}
