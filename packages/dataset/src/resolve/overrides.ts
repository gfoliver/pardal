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
  pesretrostats: {
    // "Grêmio FBPA" — the initials ARE the club's name there, and no rule gets
    // from "Foot-Ball Porto Alegrense" to "FBPA".
    "210": "ebecd36d-af62-4256-8ac6-eaf9bfbb9a3f",
    // Botafogo de Futebol e Regatas (Rio) is "Botafogo FR" there. Left to the
    // rules it matched "Botafogo FC" — which is Botafogo-SP, a different club in
    // a different division. The kind of wrong match that never announces itself,
    // so it is pinned.
    "537": "698474d8-e72c-43ba-9e83-1db7eb6f1637",
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
