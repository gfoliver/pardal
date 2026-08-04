import type { DirectoryEntry } from "@fut/career";
import { fold } from "../../components/data";

/**
 * Matching a typed name against everything in the save.
 *
 * Pure and separate from the palette that draws it, because the ranking is the part that silently
 * regresses: "fla" must answer with the club before the eleven players whose row says FLA, and an ASCII
 * "joao" must find "João". Neither is visible in a screenshot and both are one careless edit from
 * breaking.
 *
 * The match rule is the SAME one the tables use — fold the accents, then every whitespace-separated word
 * must appear somewhere — so the palette and every column filter agree on what the manager meant.
 */

/** At most this many rows. A palette that returns two hundred names has not answered anything. */
export const SEARCH_LIMIT = 30;

/** An entry with its text pre-folded. Built once per career mutation, scanned on every keystroke. */
export interface IndexedEntry {
  readonly entry: DirectoryEntry;
  /** Just the display name, folded — what "starts with" is judged against. */
  readonly name: string;
  /** Name, legal name, club code, position and nationality, folded and joined. */
  readonly haystack: string;
}

export function buildIndex(entries: readonly DirectoryEntry[]): IndexedEntry[] {
  return entries.map((entry) => ({
    entry,
    name: fold(entry.name),
    haystack: fold([entry.name, entry.legalName, entry.clubShort, entry.position, entry.nationality].filter(Boolean).join(" ")),
  }));
}

/**
 * How well an entry answers the query. Lower sorts first; `null` means it does not answer at all.
 *
 * Two ideas, and they are ordered deliberately. First, WHERE the match landed: a name beginning with what
 * he typed is almost always the one he meant, a name containing it is next, and a row that matched on
 * something else entirely — a club code, a position, a nationality — comes last, because those are useful
 * but are not what he typed a name for. Second, and only as a tie-break, WHAT it is: a club and one of our
 * own players outrank another club's player, since "fla" is a club before it is a syllable in a surname
 * and the squad you manage is the one you look up most.
 */
export function rank(e: IndexedEntry, terms: readonly string[]): number | null {
  if (!terms.every((term) => e.haystack.includes(term))) return null;
  const first = terms[0]!;
  const base = e.name.startsWith(first) ? 0 : e.name.includes(first) ? 2 : 4;
  const kind = e.entry.kind === "club" || e.entry.isMine ? 0 : 1;
  return base + kind;
}

/**
 * The rows to show for a query.
 *
 * An empty query is not "no results" — it returns the manager's own squad, so opening the palette is
 * immediately useful rather than an empty box asking to be fed.
 */
export function searchIndex(index: readonly IndexedEntry[], text: string, opts: { idleShown: number; limit?: number }): IndexedEntry[] {
  const terms = fold(text.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.filter((r) => r.entry.isMine).slice(0, opts.idleShown);
  return index
    .map((r) => ({ r, score: rank(r, terms) }))
    .filter((x): x is { r: IndexedEntry; score: number } => x.score !== null)
    // Score, then name — so equal matches come back in a stable readable order rather than in whatever
    // order the clubs happen to sit in the save.
    .sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name))
    .slice(0, opts.limit ?? SEARCH_LIMIT)
    .map((x) => x.r);
}
