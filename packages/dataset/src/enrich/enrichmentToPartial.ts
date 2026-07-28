import type { RawClub, RawPlayer, RawSnapshot } from "../raw/RawSnapshot.js";
import type { EnrichmentFile } from "./Enrichment.js";

/**
 * Project the enrichment layer onto the snapshot's own id space, so
 * `mergeSources([raw, partial])` folds it in with no special casing — the
 * enrichment is just another partial that fills gaps.
 *
 * PURE. Two rules keep it honest:
 *  - only `matched` records contribute; a miss adds nothing
 *  - no `stats` are emitted, because `mergeSources` CONCATENATES stat lines and
 *    would double every appearance if this layer carried any
 */
export function enrichmentToPartial(snapshot: RawSnapshot, enrichment: EnrichmentFile): Partial<RawSnapshot> {
  const clubs: RawClub[] = [];
  for (const club of snapshot.clubs) {
    const rec = enrichment.clubs[club.id];
    if (rec?.status !== "matched" || !rec.data) continue;
    const d = rec.data;
    clubs.push(
      defined<RawClub>({
        id: club.id,
        name: club.name,
        competitionIds: club.competitionIds,
        country: d.country,
        city: d.city,
        stadium: d.stadium,
        capacity: d.capacity,
        foundedYear: d.foundedYear,
        colours: d.colours,
        badgeUrl: d.badgeUrl,
        externalIds: rec.sourceId ? { [enrichment.source]: rec.sourceId } : undefined,
      }),
    );
  }

  const players: RawPlayer[] = [];
  for (const player of snapshot.players) {
    const rec = enrichment.players[player.id];
    if (rec?.status !== "matched" || !rec.data) continue;
    const d = rec.data;
    players.push(
      defined<RawPlayer>({
        id: player.id,
        name: player.name,
        clubId: player.clubId,
        position: player.position,
        photo: d.photo,
        photoCutout: d.photoCutout,
        // An ISO birthdate is strictly better than the source's free-text one.
        dob: d.birthDate,
        heightCm: d.heightCm,
        weightKg: d.weightKg,
        shirtNumber: d.shirtNumber,
        birthPlace: d.birthPlace,
        // The other source's position is a SECOND opinion, never a replacement:
        // Transfermarkt's label drives the squad shape.
        secondaryPositions: secondaryPositions(player, d.position),
        externalIds: rec.sourceId ? { [enrichment.source]: rec.sourceId } : undefined,
      }),
    );
  }

  return { clubs, players };
}

/**
 * Family labels that name a *line*, not a position. TheSportsDB mostly emits
 * these, and `toDomainPosition` would resolve "Defender" to centre-back — so a
 * left-back would acquire centre-back as a claimed natural position and the
 * squad-fitting would believe it. Generic labels add noise, not evidence.
 */
const GENERIC_POSITIONS = new Set(["goalkeeper", "defender", "midfielder", "forward", "attacker", "manager"]);

/**
 * Keep the source's position only when it says something new AND something
 * specific, and never let it displace an existing list.
 */
function secondaryPositions(player: RawPlayer, sourcePosition?: string): readonly string[] | undefined {
  if (!sourcePosition || GENERIC_POSITIONS.has(sourcePosition.trim().toLowerCase())) return undefined;
  const existing = player.secondaryPositions ?? [];
  const known = new Set([player.position.toLowerCase(), ...existing.map((p) => p.toLowerCase())]);
  if (known.has(sourcePosition.toLowerCase())) return undefined;
  return [...existing, sourcePosition];
}

/**
 * Drop undefined keys. `mergeSources` already ignores undefined, but emitting a
 * clean object keeps the partial readable and the intent obvious: this layer
 * only ever ADDS facts.
 */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
