import type { RawClub, RawCoach, RawCompetition, RawPlayer, RawSnapshot } from "../raw/RawSnapshot.js";

/**
 * Union several source outputs into one RAW snapshot, keyed by entity id. Later
 * partials fill gaps left by earlier ones (e.g. Transfermarkt supplies bio +
 * market value; an advanced-stats source later fills `advanced`). Pure over its
 * inputs. The first partial with a `primaryCompetitionId` wins.
 */
export function mergeSources(partials: readonly Partial<RawSnapshot>[]): RawSnapshot {
  const competitions = new Map<string, RawCompetition>();
  const clubs = new Map<string, RawClub>();
  const players = new Map<string, RawPlayer>();
  const coaches = new Map<string, RawCoach>();
  let primary: string | undefined;

  for (const part of partials) {
    primary ??= part.primaryCompetitionId;
    for (const c of part.competitions ?? []) competitions.set(c.id, { ...competitions.get(c.id), ...c });
    for (const c of part.clubs ?? []) clubs.set(c.id, { ...clubs.get(c.id), ...c });
    for (const p of part.players ?? []) {
      const prev = players.get(p.id);
      players.set(p.id, { ...prev, ...p, stats: [...(prev?.stats ?? []), ...(p.stats ?? [])], advanced: p.advanced ?? prev?.advanced });
    }
    for (const c of part.coaches ?? []) coaches.set(c.id, { ...coaches.get(c.id), ...c });
  }

  return {
    primaryCompetitionId: primary ?? "",
    competitions: [...competitions.values()],
    clubs: [...clubs.values()],
    players: [...players.values()],
    coaches: coaches.size ? [...coaches.values()] : undefined,
  };
}
