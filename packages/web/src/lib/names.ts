/**
 * Display names. Datasets carry full legal names ("Alexandro Bernabei"), which
 * are unreadable in a lineup or a table — football shows the common name
 * ("Bernabei"). We derive it instead of shipping a second name field: no source
 * gives reliable nicknames for a whole league, and a rule covers the vast
 * majority (mononyms stay whole, suffixes stay attached).
 */

/** Tokens that must not stand alone as a display name. */
const SUFFIX = new Set(["jr", "júnior", "junior", "neto", "filho", "sobrinho", "ii", "iii"]);
/** Portuguese/Spanish name particles that belong to the following token. */
const PARTICLE = new Set(["de", "da", "do", "das", "dos", "del", "della", "di", "van", "von", "la", "le", "el"]);

/**
 * Short, recognisable form of a player's name:
 *   "Alexandro Bernabei"          → "Bernabei"
 *   "Vitinho"                     → "Vitinho"        (mononym kept)
 *   "Giorgian de Arrascaeta"      → "de Arrascaeta"  (particle kept)
 *   "Vinícius Júnior"             → "Vinícius Júnior" (suffix keeps the given name)
 */
export function shortPlayerName(full: string): string {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return full.trim();

  let i = tokens.length - 1;
  // A trailing suffix isn't a name on its own — pull the token before it in.
  if (SUFFIX.has(strip(tokens[i]!))) i -= 1;
  if (i <= 0) return tokens.join(" ");
  // Keep any leading particles attached ("de Arrascaeta").
  let start = i;
  while (start > 0 && PARTICLE.has(strip(tokens[start - 1]!))) start -= 1;
  return tokens.slice(start).join(" ");
}

/**
 * Disambiguate short names within one group (a squad): if two players collapse
 * to the same short form, prefix the initial ("B. Henrique" vs "L. Henrique").
 */
export function shortNamesFor(players: readonly { playerId: string; name: string }[]): Map<string, string> {
  const short = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const p of players) {
    const s = shortPlayerName(p.name);
    counts.set(s, (counts.get(s) ?? 0) + 1);
    short.set(p.playerId, s);
  }
  for (const p of players) {
    const s = short.get(p.playerId)!;
    if ((counts.get(s) ?? 0) > 1) {
      const first = p.name.trim().split(/\s+/)[0] ?? "";
      short.set(p.playerId, first ? `${first[0]}. ${s}` : s);
    }
  }
  return short;
}

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
