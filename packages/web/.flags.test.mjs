import fs from "node:fs";
const countries = JSON.parse(fs.readFileSync("node_modules/flag-icons/country.json","utf8"));

/**
 * Nationality → flag code (as used by flag-icons: ISO 3166-1 alpha-2, plus the
 * UK home nations as "gb-eng" & friends).
 *
 * Datasets store nationality as a human name ("Brazil") because that is what
 * the sources publish; the procedural dataset stores an ISO code ("BR"). Both
 * resolve here, so screens never have to care which dataset they are showing.
 */
type Country = { readonly code: string; readonly name: string };

const byName = new Map<string, string>();
for (const c of countries as readonly Country[]) byName.set(c.name.toLowerCase(), c.code);

/**
 * Football sources name a fair few countries their own way (Transfermarkt says
 * "DR Congo", ISO says "Congo, The Democratic Republic of the"). Only the
 * variants that ISO does not already cover live here.
 */
const ALIASES: Record<string, string> = {
  "cape verde": "cv",
  "cabo verde": "cv",
  "dr congo": "cd",
  "congo dr": "cd",
  "dr kongo": "cd",
  "congo": "cg",
  "ivory coast": "ci",
  "cote d'ivoire": "ci",
  "côte d'ivoire": "ci",
  "curacao": "cw",
  "bosnia-herzegovina": "ba",
  "bosnia and herzegovina": "ba",
  "czech republic": "cz",
  "czechia": "cz",
  "korea, south": "kr",
  "south korea": "kr",
  "korea, north": "kp",
  "north korea": "kp",
  "usa": "us",
  "united states": "us",
  "russia": "ru",
  "turkey": "tr",
  "turkiye": "tr",
  "türkiye": "tr",
  "north macedonia": "mk",
  "macedonia": "mk",
  "iran": "ir",
  "syria": "sy",
  "venezuela": "ve",
  "bolivia": "bo",
  "tanzania": "tz",
  "moldova": "md",
  "kosovo": "xk",
  "chinese taipei": "tw",
  "taiwan": "tw",
  "china": "cn",
  "cape verde islands": "cv",
  "st. kitts & nevis": "kn",
  "trinidad and tobago": "tt",
  "the gambia": "gm",
  "gambia": "gm",
  "england": "gb-eng",
  "scotland": "gb-sct",
  "wales": "gb-wls",
  "northern ireland": "gb-nir",
};

/** Resolves a nationality (name or ISO code) to a flag code, if we know it. */
function flagCode(nationality: string | undefined): string | undefined {
  if (!nationality) return undefined;
  const key = nationality.trim().toLowerCase();
  if (!key) return undefined;
  const alias = ALIASES[key];
  if (alias) return alias;
  const named = byName.get(key);
  if (named) return named;
  // Already a code ("BR", "gb-eng")?
  if (/^[a-z]{2}(-[a-z]{2,3})?$/.test(key)) return key;
  return undefined;
}

export { flagCode };