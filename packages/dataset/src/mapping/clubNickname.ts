/**
 * Club display names. Sources carry the legal name ("Clube de Regatas Vasco da
 * Gama"); tables and headers need the common name ("Vasco da Gama").
 *
 * THREE tiers, in this order: a name the ratings source published, then the curated map below, then
 * derivation from the legal name.
 *
 * A sourced name wins over curation, which is the opposite of the usual rule and is deliberate. FM
 * publishes display names for every club it has, and measured against the twenty names curated here
 * by hand it agreed on seventeen and was PREFERRED on the other three — so curation is not the more
 * careful source, it is just the one that happened to exist first. It stays as the fallback for a
 * dataset built without a ratings layer, where derivation is all that is left.
 *
 * Derivation is the weak tier, and its failures are the reason this is layered at all: taking the
 * first two meaningful words of the legal name produced "Atlética Ponte" for Ponte Preta, "Brasil"
 * for CRB, "Recife" for Sport, and a "Botafogo" indistinguishable from the Rio club.
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

/** The club's common display name: sourced if a source published one, else curated, else derived. */
export function clubNickname(id: string, fullName: string, sourced?: string): string {
  if (sourced) return sourced;
  const curated = BY_TM_ID[id];
  if (curated) return curated;
  const tokens = fullName
    .replace(/\([^)]*\)/g, "") // drop "(SP)" style qualifiers
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !NOISE.has(strip(t)));
  return tokens.slice(0, 2).join(" ") || fullName;
}
