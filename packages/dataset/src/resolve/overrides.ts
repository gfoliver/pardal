/**
 * Hand-curated joins for the entities no rule will ever resolve — the escape
 * hatch behind `matchEntities`. Same shape as the curated tables in
 * `mapping/clubNickname.ts` and `mapping/clubKits.ts`: keyed by OUR id
 * (Transfermarkt), valued with the other source's id.
 *
 * Keep this small and evidence-based. An entry here is a claim that a specific
 * pairing is correct, so add one only after checking the source record — a
 * wrong override is invisible, unlike an unmatched player, which gets reported.
 */

/** `sourceId → { ourId → theirId }`. */
type OverrideTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

const CLUBS: OverrideTable = {
  thesportsdb: {
    // Populated as real builds surface failures; the run reports what it missed.
  },
};

const PLAYERS: OverrideTable = {
  thesportsdb: {},
};

export function clubOverride(source: string, ourId: string): string | undefined {
  return CLUBS[source]?.[ourId];
}

export function playerOverride(source: string, ourId: string): string | undefined {
  return PLAYERS[source]?.[ourId];
}
