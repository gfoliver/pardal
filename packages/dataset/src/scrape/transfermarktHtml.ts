import type { RawPlayer, RawStatLine } from "../raw/RawSnapshot.js";

/**
 * Pure parsers for Transfermarkt's public squad markup.
 *
 * These used to live inside the authoring-time scraper script, which made them
 * untestable — the script does network I/O at import time. They are pure string
 * → data, so they belong here with a fixture-backed test, and the script keeps
 * only the fetching.
 *
 * The lesson that forced the move: the old squad parser scanned for player
 * anchors and read a fixed window of HTML after each one. That silently dropped
 * 109 of 671 players (16%), because Transfermarkt nests a status `<span>` INSIDE
 * the name anchor for a captain, an injury or a suspension:
 *
 *     <a href="/walter-kannemann/profil/spieler/145400"> Walter Kannemann<span
 *       title="Team captain" class="kapitaenicon-table icons_sprite">&nbsp;</span> </a>
 *
 * and the pattern required `</a>` to follow the name directly. The bias was the
 * worst part: it removed exactly the captains, the injured and the suspended —
 * 15 of 16 club captains, Neymar included, never reached the dataset. Parsing by
 * ROW instead means a badge is just another child node and cannot hide a player.
 */

/** One `<tr>` of a `table.items` body that refers to a player. */
export function squadRows(html: string): string[] {
  const i = html.indexOf('<table class="items"');
  if (i < 0) return [];
  const from = html.indexOf("<tbody>", i);
  const to = html.indexOf("</tbody>", i);
  if (from < 0 || to < 0) return [];
  return html
    .slice(from + 7, to)
    .split(/(?=<tr class="(?:odd|even)">)/)
    .filter((r) => r.includes("/profil/spieler/"));
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

/** "€30.00m" / "€800k" / "€2.00bn" → integer EUR. */
export function parseValue(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/\s/g, "").match(/€([\d.,]+)(m|k|bn)?/i);
  if (!m) return undefined;
  let n = parseFloat(m[1]!.replace(/,/g, ""));
  const u = (m[2] ?? "").toLowerCase();
  if (u === "m") n *= 1e6;
  else if (u === "k") n *= 1e3;
  else if (u === "bn") n *= 1e9;
  return Math.round(n);
}

/**
 * Every player in a club's `kader` page, one per table row.
 *
 * `seasonId` only labels the stat placeholder; real numbers are merged in later
 * from the club's performance table.
 */
/**
 * `competitionId` stamps the PLACEHOLDER stat line every player starts with. The caller replaces it
 * with the real one from the performance page, so it never reaches an artifact — but it was hard-coded
 * to `BRA1`, which stopped being harmless the moment a second competition existed: a half-finished
 * scrape would have written Série B players carrying Série A's code.
 */
export function parseKader(html: string, clubId: string, seasonId: string, competitionId: string): RawPlayer[] {
  const players: RawPlayer[] = [];
  const seen = new Set<string>();

  for (const row of squadRows(html)) {
    // The name cell is `<td class="hauptlink">`; the market-value cell is
    // `class="rechts hauptlink"`, so match the profile link and stop at the
    // first tag — which is how a captain/injury badge stops being a problem.
    const nameM = row.match(/\/profil\/spieler\/(\d+)"\s*>\s*([^<]+?)\s*(?:<|$)/);
    if (!nameM) continue;
    const id = nameM[1]!;
    if (seen.has(id)) continue;
    seen.add(id);

    // Shirt number lives in its own cell and reads "-" when the club hasn't
    // assigned one.
    const shirtRaw = row.match(/rn_nummer[^>]*>\s*([^<]*?)\s*</)?.[1] ?? "";
    const shirt = /^\d+$/.test(shirtRaw) ? Number(shirtRaw) : undefined;

    // The inline table under the portrait holds the position on its second row.
    const posM = row.match(/<tr>\s*<td>\s*([A-Za-z][A-Za-z\- ]*?)\s*<\/td>\s*<\/tr>/);
    const dobM = row.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})\s*\((\d{1,2})\)/);
    // A player can hold two passports, and only the flag images carry this class
    // — the previous-club crest in the same row does not.
    const nats = [...row.matchAll(/class="flaggenrahmen"[^>]*title="([^"]+)"|title="([^"]+)"[^>]*class="flaggenrahmen"/g)]
      .map((m) => decode(m[1] ?? m[2] ?? ""))
      .filter(Boolean);
    const heightM = row.match(/(\d),(\d{2})\s*m/);
    const footM = row.match(/>\s*(right|left|both)\s*</i);
    // Dates in plain cells run: born, joined, contract-until. The last one is
    // the expiry; a player with no contract date simply has fewer.
    const dates = [...row.matchAll(/<td class="zentriert">\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*<\/td>/g)].map((m) => m[1]!);
    const mvs = [...row.matchAll(/€[\d.,]+(?:m|k|bn)?/gi)];

    players.push({
      id: `tm-${id}`,
      name: decode(nameM[2]!),
      clubId,
      position: posM ? posM[1]!.trim() : "Central Midfield",
      age: dobM ? Number(dobM[2]) : undefined,
      dob: dobM ? dobM[1]! : undefined,
      nationality: [...new Set(nats)],
      foot: footM ? footM[1]!.toLowerCase() : undefined,
      heightCm: heightM ? Number(heightM[1]) * 100 + Number(heightM[2]) : undefined,
      marketValueEur: parseValue(mvs.at(-1)?.[0]),
      contractExpires: dates.at(-1),
      shirtNumber: shirt,
      stats: [{ source: "transfermarkt", competitionId, seasonId, appearances: 0, minutes: 0, goals: 0, assists: 0 } satisfies RawStatLine],
    });
  }
  return players;
}

export interface ScrapedStats {
  readonly apps: number;
  readonly goals: number;
  readonly assists: number;
  readonly yellow: number;
  readonly red: number;
}

const numOr0 = (s: string | undefined) => {
  const n = parseInt(String(s ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Parse a club's `leistungsdaten` table → source player id → basic stats. */
export function parseStats(html: string): Map<string, ScrapedStats> {
  const map = new Map<string, ScrapedStats>();
  for (const row of squadRows(html)) {
    const idM = row.match(/\/profil\/spieler\/(\d+)/);
    if (!idM) continue;
    // Cell layout: [shirt, age, nat, inSquad, appearances, goals, assists,
    // yellow, 2ndYellow, red, subsOn, subsOff, ppg]
    const cells = [...row.matchAll(/<td[^>]*class="[^"]*zentriert[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").replace(/\s+/g, "").trim(),
    );
    map.set(idM[1]!, {
      apps: numOr0(cells[4]),
      goals: numOr0(cells[5]),
      assists: numOr0(cells[6]),
      yellow: numOr0(cells[7]),
      red: numOr0(cells[9]),
    });
  }
  return map;
}
