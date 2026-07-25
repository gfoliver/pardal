/**
 * Club display names. Sources carry the legal name ("Clube de Regatas Vasco da
 * Gama"); tables and headers need the common name ("Vasco"). Derivation alone
 * gets most cases but mangles a few (Grêmio Foot-Ball Porto Alegrense), so a
 * curated map — keyed by Transfermarkt club id — overrides where it matters and
 * the rule handles everything else (other leagues, community datasets).
 */
const BY_TM_ID: Record<string, string> = {
  "614": "Flamengo",
  "1023": "Palmeiras",
  "609": "Cruzeiro",
  "199": "Corinthians",
  "10010": "Bahia",
  "537": "Botafogo",
  "2462": "Fluminense",
  "978": "Vasco",
  "210": "Grêmio",
  "221": "Santos",
  "8793": "Bragantino",
  "330": "Atlético-MG",
  "585": "São Paulo",
  "679": "Athletico-PR",
  "6600": "Internacional",
  "2125": "Vitória",
  "776": "Coritiba",
  "3876": "Mirassol",
  "10997": "Remo",
  "17776": "Chapecoense",
};

/** Words that never carry the identity of a club on their own. */
const NOISE = new Set([
  "clube", "club", "sociedade", "esportiva", "esporte", "sport", "futebol", "football", "foot-ball",
  "regatas", "associacao", "associação", "de", "do", "da", "das", "dos", "e", "fc", "ec", "sc", "cr",
  "se", "ac", "aa", "ca", "rb", "red", "bull",
]);

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The club's common display name (curated when known, else derived). */
export function clubNickname(id: string, fullName: string): string {
  const curated = BY_TM_ID[id];
  if (curated) return curated;
  const tokens = fullName
    .replace(/\([^)]*\)/g, "") // drop "(SP)" style qualifiers
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !NOISE.has(strip(t)));
  return tokens.slice(0, 2).join(" ") || fullName;
}
