/**
 * Entity resolution between our RAW snapshot (Transfermarkt-keyed) and a second
 * source that knows nothing about those ids. PURE — no network, no clock — so
 * every matching rule is unit-testable on fixtures.
 *
 * The danger this module exists to prevent is a CONFIDENT WRONG MATCH: an
 * enricher that attaches the wrong player's photo and birthdate is worse than
 * one that attaches nothing. So every rule here either produces evidence or
 * refuses, and refusals are reported rather than silently downgraded to a guess.
 */

/** Case/accent/punctuation-insensitive form used for every name comparison. */
export function normaliseName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics: "Vitão" → "Vitao"
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation is noise: "Ñíguez" / "O'Hara"
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string): string[] => normaliseName(s).split(" ").filter(Boolean);

/**
 * Words that say what KIND of organisation a club is, not which one. Sources
 * disagree wildly on these ("Sociedade Esportiva Palmeiras" vs "Palmeiras"), so
 * they're dropped before comparing — and also dropped from a search query,
 * because a source indexes the club under its common name.
 *
 * Note what is NOT here: "Grêmio" and "Atlético". They read like organisation
 * words, and in Portuguese they often are — but they are also load-bearing
 * parts of real club names in this very league. Dropping "atletico" let
 * "Clube Atlético Mineiro" match "América Mineiro" on the single shared token.
 */
const ORG_WORDS = new Set([
  "fc", "cf", "sc", "ec", "ac", "af", "ad", "se", "cr", "ca", "aa",
  "clube", "club", "futebol", "regatas", "esporte", "esportivo", "esportiva",
  "sociedade", "associacao", "recreativo",
  "foot", "ball", "team", "the",
]);

/** Connectives — noise when comparing tokens, but part of a searchable name. */
const CONNECTIVES = new Set(["de", "do", "da", "dos", "das"]);

/**
 * Words that make a candidate a DIFFERENT team rather than a looser spelling of
 * the same one. Without this, token-subset matching happily accepts "Palmeiras
 * U20" and "Internacional Women" for the men's senior sides — a confident wrong
 * match that then poisons every player resolved under that club's id.
 */
const TEAM_QUALIFIERS = new Set([
  "women", "womens", "ladies", "feminino", "feminina", "fem", "w",
  "u15", "u16", "u17", "u18", "u19", "u20", "u21", "u22", "u23", "sub",
  "youth", "academy", "junior", "juniors", "juvenil", "reserve", "reserves",
  "b", "ii", "futsal", "beach", "esports",
]);

const clubTokens = (s: string): string[] => {
  const all = tokens(s);
  const meaningful = all.filter((t) => !ORG_WORDS.has(t) && !CONNECTIVES.has(t));
  return meaningful.length > 0 ? meaningful : all; // never reduce a name to nothing
};

/**
 * A candidate that qualifies our name with "Women", "U20" or similar names a
 * different team. Only tokens the candidate ADDS count — a club genuinely
 * called "Botafogo B" would carry the qualifier on both sides.
 */
function isDifferentTeam(ourTokens: ReadonlySet<string>, candidateName: string): boolean {
  return clubTokens(candidateName).some((t) => !ourTokens.has(t) && TEAM_QUALIFIERS.has(t));
}

/**
 * Queries to try against a name-search endpoint, most specific first. A source
 * indexes a club under its common name, so the legal name ("Clube de Regatas
 * Vasco da Gama") can return nothing at all while "Vasco da Gama" resolves.
 */
export function clubSearchTerms(club: { readonly name: string; readonly shortName?: string }): string[] {
  const words = club.name.split(/\s+/).filter(Boolean);
  const key = (w: string) => normaliseName(w).replace(/\s/g, "");
  const withoutOrg = words.filter((w) => !ORG_WORDS.has(key(w)));
  const distinctive = withoutOrg.filter((w) => !CONNECTIVES.has(key(w)));
  // Dropping "Clube"/"Regatas" can leave a dangling "de" at either end.
  const common = [...withoutOrg];
  while (common.length && CONNECTIVES.has(key(common[0]!))) common.shift();
  while (common.length && CONNECTIVES.has(key(common[common.length - 1]!))) common.pop();

  // The longest distinctive word before the first: for "Sport Club
  // Internacional" and "Red Bull Bragantino" the identifying word is the last
  // one, and searching the first ("Sport", "Red") returns other clubs entirely.
  const longest = [...distinctive].sort((a, b) => b.length - a.length)[0] ?? "";

  const terms = [club.name, common.join(" "), longest, distinctive[0] ?? "", club.shortName ?? ""];
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/** How a match was arrived at — surfaced so a run can be audited. */
export type MatchMethod = "externalId" | "exactName" | "tokenSubset" | "alternateName" | "override";

export interface Match<T> {
  readonly candidate: T;
  readonly method: MatchMethod;
}

export interface MatchReport {
  readonly matched: number;
  /** Our ids we found nothing for. */
  readonly unmatched: readonly string[];
  /** Our ids where several candidates fitted equally well — refused, not guessed. */
  readonly ambiguous: readonly string[];
}

export function emptyReport(): MatchReport {
  return { matched: 0, unmatched: [], ambiguous: [] };
}

/** The outcome of a match attempt: a match, a refusal for ambiguity, or nothing. */
export type MatchOutcome<T> = Match<T> | { readonly ambiguous: true } | undefined;

export const isAmbiguous = <T>(r: MatchOutcome<T>): r is { readonly ambiguous: true } =>
  r !== undefined && "ambiguous" in r;

/** The matched candidate, or undefined when the attempt was refused or empty. */
export const accepted = <T>(r: MatchOutcome<T>): Match<T> | undefined =>
  r !== undefined && !("ambiguous" in r) ? r : undefined;

// --- clubs ------------------------------------------------------------------

/** The shape a club candidate must expose; the source adapter maps into this. */
export interface ClubCandidate {
  readonly sourceId: string;
  readonly name: string;
  readonly alternateNames?: readonly string[];
  readonly shortName?: string;
}

/**
 * Match one of our clubs against the candidates a search returned. Exact
 * normalised name first, then a token-subset test (one name's meaningful words
 * being a subset of the other's covers "Sociedade Esportiva Palmeiras" ↔
 * "Palmeiras"), then alternate names, then the short code.
 *
 * `override` is consulted first and wins outright — the escape hatch for the
 * handful no rule will ever get right.
 */
export function matchClub(
  club: { readonly id: string; readonly name: string; readonly shortName?: string },
  all: readonly ClubCandidate[],
  override?: string,
): Match<ClubCandidate> | { readonly ambiguous: true } | undefined {
  if (override) {
    const hit = all.find((c) => c.sourceId === override);
    if (hit) return { candidate: hit, method: "override" };
  }
  const ourTokens = new Set(clubTokens(club.name));
  // Drop the women's, youth and reserve sides before any rule runs — they are
  // not weaker matches for the senior team, they are the wrong team.
  const candidates = all.filter((c) => !isDifferentTeam(ourTokens, c.name));
  if (candidates.length === 0) return undefined;

  const ours = normaliseName(club.name);
  const exact = candidates.filter((c) => normaliseName(c.name) === ours);
  if (exact.length === 1) return { candidate: exact[0]!, method: "exactName" };
  if (exact.length > 1) return { ambiguous: true };

  const subset = candidates.filter((c) => {
    const theirs = new Set(clubTokens(c.name));
    return covers(ourTokens, theirs) || covers(theirs, ourTokens);
  });
  if (subset.length === 1) return { candidate: subset[0]!, method: "tokenSubset" };
  if (subset.length > 1) return { ambiguous: true };

  const byAlternate = candidates.filter((c) =>
    (c.alternateNames ?? []).some((a) => {
      const alt = new Set(clubTokens(a));
      return normaliseName(a) === ours || covers(ourTokens, alt) || covers(alt, ourTokens);
    }),
  );
  if (byAlternate.length === 1) return { candidate: byAlternate[0]!, method: "alternateName" };
  if (byAlternate.length > 1) return { ambiguous: true };

  if (club.shortName) {
    const short = normaliseName(club.shortName);
    const byShort = candidates.filter((c) => c.shortName && normaliseName(c.shortName) === short);
    if (byShort.length === 1) return { candidate: byShort[0]!, method: "alternateName" };
  }
  return undefined;
}

/** Every token of `inner` appears in `outer` (and `inner` isn't empty). */
function covers(outer: ReadonlySet<string>, inner: ReadonlySet<string>): boolean {
  if (inner.size === 0) return false;
  for (const t of inner) if (!outer.has(t)) return false;
  return true;
}

// --- players ----------------------------------------------------------------

export interface PlayerCandidate {
  readonly sourceId: string;
  readonly name: string;
  readonly alternateNames?: readonly string[];
  /** The candidate's club in the SOURCE's own id space. */
  readonly sourceClubId?: string;
  /** ISO `yyyy-mm-dd` when the source has it. */
  readonly birthDate?: string;
  /** The candidate's Transfermarkt id, when the source publishes one. */
  readonly transfermarktId?: string;
}

export interface PlayerMatchInput {
  readonly id: string;
  readonly name: string;
  /** Our club's id IN THE SOURCE's space — i.e. the already-matched club. */
  readonly expectedSourceClubId?: string;
  /** Birth year we already believe, for corroboration. */
  readonly birthYear?: number;
  /** Full birth date as ISO `yyyy-mm-dd`, when we can parse one. */
  readonly birthDate?: string;
}

/** How a candidate earned the right to be considered at all. */
type Evidence = "club" | "birthDate";

/**
 * Match one of our players against candidates, refusing anything unproven.
 *
 * Two independent routes to being considered, because each covers the other's
 * blind spot:
 *
 *  - **Club.** A name search for "Pedro" returns Lazio's Pedro just as happily
 *    as Flamengo's, and the free API gives no relevance score — so a name hit
 *    normally counts only when the candidate plays for the club we matched.
 *  - **Exact birth date.** The club guard alone is too strict: a source with a
 *    stale transfer (TheSportsDB still had Guillermo Maripán at Torino) buries a
 *    perfect match. A day-exact birth date is the stronger identifier of the two
 *    — transfers change, birthdays don't — so it admits a candidate on its own.
 *
 * The second route is deliberately narrower: it accepts only an exact or
 * alternate-name hit, never a token subset. "Pedro" ↔ "Pedro Guilherme" must
 * still be vouched for by the club, so a coincidental birthday can't carry it.
 */
export function matchPlayer(
  player: PlayerMatchInput,
  candidates: readonly PlayerCandidate[],
  override?: string,
): Match<PlayerCandidate> | { readonly ambiguous: true } | undefined {
  if (override) {
    const hit = candidates.find((c) => c.sourceId === override);
    if (hit) return { candidate: hit, method: "override" };
  }

  // An explicit cross-reference beats any amount of string cleverness.
  const byId = candidates.filter((c) => c.transfermarktId && c.transfermarktId === player.id);
  if (byId.length === 1) return { candidate: byId[0]!, method: "externalId" };

  const evidence = new Map<PlayerCandidate, Evidence>();
  for (const c of candidates) {
    if (birthDateMatches(player, c)) evidence.set(c, "birthDate");
    else if (sameClub(player, c) && birthYearAgrees(player, c)) evidence.set(c, "club");
  }
  const plausible = candidates.filter((c) => evidence.has(c));
  if (plausible.length === 0) return undefined;

  const ours = normaliseName(player.name);
  const exact = plausible.filter((c) => normaliseName(c.name) === ours);
  if (exact.length === 1) return { candidate: exact[0]!, method: "exactName" };
  if (exact.length > 1) return { ambiguous: true };

  const byAlternate = plausible.filter((c) => (c.alternateNames ?? []).some((a) => normaliseName(a) === ours));
  if (byAlternate.length === 1) return { candidate: byAlternate[0]!, method: "alternateName" };
  if (byAlternate.length > 1) return { ambiguous: true };

  /*
   * Full name against a shorter registered name, or vice versa ("Pedro
   * Guilherme" ↔ "Pedro") — the loosest rule, so the CLUB has to vouch for it.
   *
   * Note this asks `sameClub` directly rather than reading the evidence label.
   * The labels are exclusive (`birthDate` is recorded in preference to `club`),
   * so a candidate who agreed on BOTH was indistinguishable from one who agreed
   * on the birth date alone — and was therefore refused here. That cost real
   * players: the source's "Alix Vinicius" against our "Alix", same club, born
   * 1999-11-06 on both sides, went unmatched and fell through to the backfill,
   * where he came out at 85 against the 76 the source states.
   *
   * A coincidental birthday at a DIFFERENT club still isn't enough, which is the
   * distinction this rule has always been trying to draw.
   */
  const ourTokens = new Set(tokens(player.name));
  const subset = plausible.filter((c) => {
    if (!sameClub(player, c)) return false;
    const names = [c.name, ...(c.alternateNames ?? [])];
    return names.some((n) => {
      const theirs = new Set(tokens(n));
      return covers(ourTokens, theirs) || covers(theirs, ourTokens);
    });
  });
  if (subset.length === 1) return { candidate: subset[0]!, method: "tokenSubset" };
  if (subset.length > 1) return { ambiguous: true };

  return undefined;
}

/** Day-exact agreement on a birth date both sides actually know. */
function birthDateMatches(player: PlayerMatchInput, candidate: PlayerCandidate): boolean {
  if (!player.birthDate || !candidate.birthDate) return false;
  return player.birthDate === candidate.birthDate;
}

/**
 * The candidate must belong to the club we matched. When we never resolved the
 * club, we have no guard to apply and refuse rather than gamble.
 */
function sameClub(player: PlayerMatchInput, candidate: PlayerCandidate): boolean {
  if (!player.expectedSourceClubId) return false;
  return candidate.sourceClubId === player.expectedSourceClubId;
}

/** A known-but-different birth year is disqualifying; an unknown one is not. */
function birthYearAgrees(player: PlayerMatchInput, candidate: PlayerCandidate): boolean {
  if (!player.birthYear || !candidate.birthDate) return true;
  const year = Number(candidate.birthDate.slice(0, 4));
  if (!Number.isFinite(year)) return true;
  return year === player.birthYear;
}
