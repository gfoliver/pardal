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
  return e.name.startsWith(first) ? 0 : e.name.includes(first) ? 1 : 2;
}

/**
 * Which section a row belongs in, and therefore where it sits: clubs, then our own squad, then everyone
 * else.
 *
 * This is a SECTION order, not a quality score, and separating the two is the fix for a palette whose
 * headers repeated. Ranking used to fold "is it a club" into the score, so the one sorted list alternated
 * between kinds — Rossi, Sandro, Andrew, Athletico-PR, Atlético-MG, Ayrton Lucas — and a run-length
 * grouping drew a header every time the kind changed: "Meu elenco", "Clubes", "Meu elenco", "Jogadores".
 * Sorting by section first and quality within it means every heading appears exactly once.
 *
 * The cost is honest and worth naming: a club that merely contains the query now sits above a player whose
 * name begins with it. That is what a section is for — you scan the block you meant, and the heading says
 * which block that is.
 */
export function bucket(e: IndexedEntry): number {
  if (e.entry.kind === "club") return 0;
  return e.entry.isMine ? 1 : 2;
}

/**
 * How many rows each section may take before the next one starts.
 *
 * Without this, sorting by section first lets one section eat the whole budget: searching "a" matches
 * nearly every club name, and twenty clubs plus a squad filled all thirty rows, so the "Jogadores"
 * heading vanished entirely — six hundred players and not one of them shown. Clubs and our own squad are
 * small sets you want a glance at; the market is the one that deserves the remaining room.
 */
const SECTION_CAP: readonly number[] = [5, 6, Infinity];

/**
 * The rows to show for a query.
 *
 * An empty query is not "no results" — it returns the manager's own squad, so opening the palette is
 * immediately useful rather than an empty box asking to be fed.
 */
export function searchIndex(index: readonly IndexedEntry[], text: string, opts: { idleShown: number; limit?: number }): IndexedEntry[] {
  const terms = fold(text.trim()).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.filter((r) => r.entry.isMine).slice(0, opts.idleShown);

  const scored = index
    .map((r) => ({ r, score: rank(r, terms) }))
    .filter((x): x is { r: IndexedEntry; score: number } => x.score !== null)
    // Section, then quality, then name. The last one matters as much as it looks trivial: without it the
    // order falls back to whichever club happens to sit first in the save.
    .sort((a, b) => bucket(a.r) - bucket(b.r) || a.score - b.score || a.r.name.localeCompare(b.r.name));

  const taken: number[] = [];
  const out: IndexedEntry[] = [];
  const limit = opts.limit ?? SEARCH_LIMIT;
  for (const { r } of scored) {
    if (out.length >= limit) break;
    const s = bucket(r);
    taken[s] = (taken[s] ?? 0) + 1;
    if (taken[s] > (SECTION_CAP[s] ?? Infinity)) continue;
    out.push(r);
  }
  return out;
}
