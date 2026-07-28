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
 * Union several source outputs into one RAW snapshot, keyed by entity id. Later
 * partials fill gaps left by earlier ones (e.g. Transfermarkt supplies bio +
 * market value; an enricher later fills photos and real height/weight). Pure
 * over its inputs. The first partial with a `primaryCompetitionId` wins.
 */
export function mergeSources(partials: readonly Partial<RawSnapshot>[]): RawSnapshot {
  const competitions = new Map<string, RawCompetition>();
  const clubs = new Map<string, RawClub>();
  const players = new Map<string, RawPlayer>();
  const coaches = new Map<string, RawCoach>();
  let primary: string | undefined;

  for (const part of partials) {
    primary ??= part.primaryCompetitionId;
    for (const c of part.competitions ?? []) competitions.set(c.id, overlay(competitions.get(c.id), c));
    for (const c of part.clubs ?? []) clubs.set(c.id, overlay(clubs.get(c.id), c));
    for (const p of part.players ?? []) {
      const prev = players.get(p.id);
      const merged = overlay(prev, p);
      players.set(p.id, { ...merged, stats: [...(prev?.stats ?? []), ...(p.stats ?? [])], advanced: p.advanced ?? prev?.advanced });
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
