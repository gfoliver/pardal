import type { RawClub, RawCoach, RawCompetition, RawPlayer, RawSnapshot } from "../raw/RawSnapshot.js";

/**
 * Overlay `next` onto `prev`, ignoring keys whose value is `undefined`.
 *
 * A plain spread would let a later partial ERASE a good earlier value: an
 * enricher that returns `{ heightCm: undefined }` for a player it couldn't
 * match would wipe the height the base source did have. "Fills gaps" has to
 * mean exactly that — a source can add a field, never blank one.
 */
function overlay<T extends object>(prev: T | undefined, next: T): T {
  const out = { ...(prev ?? ({} as T)) };
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * A competition seen twice, merged.
 *
 * Its entrant list UNIONS instead of being overwritten, which is the one place `overlay` is the wrong
 * rule. Two snapshots of different divisions both name the same domestic cup, and plain overlay let
 * the second one's entrants replace the first's — so merging Série A and Série B gave the Copa do
 * Brasil twenty entrants rather than forty, silently losing half the field. Entrants are a set, the
 * same way a player's `stats` are a list.
 */
function mergeCompetition(prev: RawCompetition | undefined, next: RawCompetition): RawCompetition {
  const merged = overlay(prev, next);
  if (!prev) return merged;
  return { ...merged, entrantClubIds: [...new Set([...prev.entrantClubIds, ...next.entrantClubIds])] };
}

/** Minutes a set of stat lines credits a player with. */
const minutesIn = (stats: RawPlayer["stats"]): number => (stats ?? []).reduce((s, l) => s + (l.minutes ?? 0), 0);

/**
 * A player seen in TWO divisions' squads, placed at one club.
 *
 * Four of the 1305 players appear on both a Série A and a Série B squad page — a mid-window move
 * Transfermarkt shows on both sides, or a loan. `overlay` gave the club to whichever snapshot was
 * merged last, which meant argument order decided where a real footballer plays; Série B always won
 * because it is second on the command line.
 *
 * Decided on MINUTES instead: the squad page that credits him with time on the pitch is the club he
 * was actually at, and the other is a page listing a name. That resolves all four uniquely and in
 * both directions — three stay in Série A, and Sergio Palacios correctly moves to Ponte Preta, where
 * his 720 minutes are. The alternative rules do not survive contact with the data: "prefer the top
 * flight" gets Palacios wrong, and "prefer the newer contract date" disagrees with the minutes on two
 * of the four.
 *
 * Ties (nobody played, so nothing was observed) keep the incumbent rather than reshuffling on
 * argument order.
 */
function placeAtClub(prev: RawPlayer, next: RawPlayer, merged: RawPlayer): RawPlayer {
  if (prev.clubId === next.clubId) return merged;
  return { ...merged, clubId: minutesIn(next.stats) > minutesIn(prev.stats) ? next.clubId : prev.clubId };
}

/**
 * Union several source outputs into one RAW snapshot, keyed by entity id. Later
 * partials fill gaps left by earlier ones (e.g. Transfermarkt supplies bio +
 * market value; an enricher later fills photos and real height/weight). Pure
 * over its inputs. The first partial with a `primaryCompetitionId` wins.
 *
 * Also how two DIVISIONS become one dataset: `mergeSources([serieA, serieB])` produces a snapshot
 * whose world names both leagues with their tiers, which is what a career turns into a pyramid.
 */
export function mergeSources(partials: readonly Partial<RawSnapshot>[]): RawSnapshot {
  const competitions = new Map<string, RawCompetition>();
  const clubs = new Map<string, RawClub>();
  const players = new Map<string, RawPlayer>();
  const coaches = new Map<string, RawCoach>();
  let primary: string | undefined;

  for (const part of partials) {
    primary ??= part.primaryCompetitionId;
    for (const c of part.competitions ?? []) competitions.set(c.id, mergeCompetition(competitions.get(c.id), c));
    for (const c of part.clubs ?? []) clubs.set(c.id, overlay(clubs.get(c.id), c));
    for (const p of part.players ?? []) {
      const prev = players.get(p.id);
      const merged = { ...overlay(prev, p), stats: [...(prev?.stats ?? []), ...(p.stats ?? [])], advanced: p.advanced ?? prev?.advanced };
      players.set(p.id, prev ? placeAtClub(prev, p, merged) : merged);
    }
    for (const c of part.coaches ?? []) coaches.set(c.id, overlay(coaches.get(c.id), c));
  }

  return {
    primaryCompetitionId: primary ?? "",
    competitions: [...competitions.values()],
    clubs: [...clubs.values()],
    players: [...players.values()],
    coaches: coaches.size ? [...coaches.values()] : undefined,
  };
}
