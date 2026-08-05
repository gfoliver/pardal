/**
 * Authoring-time scraper (NOT part of the app) that assembles a REAL league snapshot from
 * Transfermarkt public pages into a committed RAW file. Run once per competition, offline
 * thereafter — the pure pipeline turns the snapshot into the dataset the game loads. Personal,
 * low-volume, polite pacing; data © Transfermarkt (see manifest attribution).
 *
 *   npx tsx packages/dataset/data/scrapeTransfermarkt.ts --competition=BRA1 [--season=2025]
 *
 * `saison_id` 2025 = the 2025/26 campaign (populated squads).
 *
 * This replaced a Série A-only script. Everything it needs per competition that cannot be derived
 * from the code — the URL slug, the display name, the tier, the badge file — lives in `COMPETITIONS`
 * below, because Transfermarkt's own URLs are not derivable from a competition code.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawClub, RawCompetition, RawPlayer, RawSnapshot, RawStatLine } from "../src/raw/RawSnapshot.js";
import { parseKader, parseStats } from "../src/scrape/transfermarktHtml.js";

interface CupSpec {
  readonly id: string;
  readonly name: string;
  readonly twoLegged: boolean;
}

interface CompetitionSpec {
  /** Transfermarkt's own competition code, and ours. */
  readonly id: string;
  /** The URL slug. Not derivable from the code, which is the reason this table exists. */
  readonly slug: string;
  readonly name: string;
  /** 1 = top flight. Carried into the artifact's world, where it builds the pyramid. */
  readonly tier: number;
  /** How many clubs contest it — the floor for the sanity check below. */
  readonly clubs: number;
  /** Badge file under the CDN's `logo/header/`. Best-effort: a miss just means no logo. */
  readonly logoFile: string;
  /** Output directory under `data/`. */
  readonly dataset: string;
  /** Domestic cups these clubs enter. */
  readonly cups: readonly CupSpec[];
}

const COPA_DO_BRASIL: CupSpec = { id: "BRC", name: "Copa do Brasil", twoLegged: true };

const COMPETITIONS: readonly CompetitionSpec[] = [
  {
    id: "BRA1",
    slug: "campeonato-brasileiro-serie-a",
    name: "Brasileirão Série A",
    tier: 1,
    clubs: 20,
    logoFile: "bra1.png",
    dataset: "brasileirao-serie-a",
    cups: [COPA_DO_BRASIL],
  },
  {
    id: "BRA2",
    slug: "campeonato-brasileiro-serie-b",
    name: "Brasileirão Série B",
    tier: 2,
    clubs: 20,
    logoFile: "bra2.png",
    dataset: "brasileirao-serie-b",
    // Série B clubs do enter the Copa do Brasil. Listing it here means the merged world gives the cup
    // both divisions' entrants rather than only the top flight's.
    cups: [COPA_DO_BRASIL],
  },
];

/**
 * A squad smaller than this means the markup moved and we are silently losing players — which is
 * exactly what happened before: a name-anchor pattern that couldn't cope with a captain's armband
 * dropped 16% of every squad, and nothing noticed because the only check counted clubs, not players.
 */
const MIN_SQUAD = 18;

function parseArgs(argv: readonly string[]): { competition: string; season: string } {
  const flags: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]!] = m[2] ?? "true";
  }
  const competition = flags.competition ?? "";
  if (!competition) {
    const known = COMPETITIONS.map((c) => c.id).join(", ");
    throw new Error(`Missing --competition=<code>. Known: ${known}`);
  }
  return { competition, season: flags.season ?? "2025" };
}

const BASE = "https://www.transfermarkt.us";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const CDN = "https://tmssl.akamaized.net/images";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  await sleep(350); // be polite
  return res.text();
}

/** Fetch an image (absolute URL) and inline it as a data URI, or undefined. */
async function fetchDataUri(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    await sleep(150);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

interface ClubRef { id: string; slug: string; name: string }

/** The participants live in the competition startseite's main `table.items`. */
function extractClubs(html: string, season: string): ClubRef[] {
  const i = html.indexOf('<table class="items"');
  const tbl = i >= 0 ? html.slice(i, html.indexOf("</table>", i)) : html;
  const seen = new Map<string, ClubRef>();
  const re = new RegExp(`<a title="([^"]+)" href="/([a-z0-9-]+)/startseite/verein/(\\d+)/saison_id/${season}"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(tbl))) if (!seen.has(m[3]!)) seen.set(m[3]!, { id: m[3]!, slug: m[2]!, name: decode(m[1]!) });
  return [...seen.values()];
}

const STOP = new Set([
  "sociedade", "esportiva", "esporte", "clube", "club", "de", "do", "da", "e", "futebol", "regatas",
  "football", "foot-ball", "associacao", "sport", "fc", "cr", "ec", "sc", "se", "rb", "red", "bull",
  "paulista", "porto", "alegrense", "alegre", "of", "and",
]);
function shortName(name: string): string {
  const tokens = name.split(/\s+/).map((t) => t.replace(/[().]/g, "")).filter((t) => t && !STOP.has(stripAccents(t).toLowerCase()));
  const joined = stripAccents((tokens[0] ?? name)).replace(/[^A-Za-z]/g, "");
  return (joined || stripAccents(name)).slice(0, 3).toUpperCase();
}

function parseClubMeta(html: string): { stadium?: string; capacity?: number; founded?: number } {
  const stadium = html.match(/Stadium:\s*<span[^>]*data-header__content[^>]*>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1];
  const founded = html.match(/Founded:<\/th>\s*<td>[^<]*?(\d{4})/)?.[1];
  const seats =
    html.match(/data-header__content"[^>]*>\s*([\d.,]{4,})\s*<span[^>]*>\s*Seats/)?.[1] ??
    html.match(/([\d.,]{4,})\s*<span[^>]*>\s*Seats/)?.[1] ??
    html.match(/Seats:<\/th>\s*<td>\s*([\d.,]+)/)?.[1];
  return {
    stadium: stadium ? decode(stadium) : undefined,
    capacity: seats ? Number(seats.replace(/[.,]/g, "")) : undefined,
    founded: founded ? Number(founded) : undefined,
  };
}

async function main(): Promise<void> {
  const { competition, season } = parseArgs(process.argv.slice(2));
  const spec = COMPETITIONS.find((c) => c.id === competition);
  if (!spec) {
    throw new Error(`Unknown competition "${competition}". Known: ${COMPETITIONS.map((c) => c.id).join(", ")}`);
  }

  console.log(`Scraping ${spec.name} (saison ${season}) from Transfermarkt …`);
  const startseite = await get(`/${spec.slug}/startseite/wettbewerb/${spec.id}/plus/?saison_id=${season}`);
  const clubRefs = extractClubs(startseite, season);
  console.log(`Found ${clubRefs.length} clubs.`);
  /*
   * Against the competition's OWN size, and it aborts. The number is the first thing that reveals a
   * changed page or a wrong slug, and continuing would write a league missing half its clubs — which
   * the pipeline downstream would happily accept.
   */
  if (clubRefs.length < spec.clubs - 2) {
    throw new Error(
      `Expected ~${spec.clubs} clubs for ${spec.id}, got ${clubRefs.length}. ` +
        `Either the startseite markup changed or the slug "${spec.slug}" is wrong.`,
    );
  }

  const leagueLogo = await fetchDataUri(`${CDN}/logo/header/${spec.logoFile}`);
  const cupIds = spec.cups.map((c) => c.id);

  const clubs: RawClub[] = [];
  const players: RawPlayer[] = [];
  for (const c of clubRefs) {
    const squad = parseKader(await get(`/${c.slug}/kader/verein/${c.id}/saison_id/${season}/plus/1`), c.id, season, spec.id);
    if (squad.length < MIN_SQUAD) {
      throw new Error(
        `${c.name}: parsed only ${squad.length} players (expected ≥ ${MIN_SQUAD}). ` +
          `The kader markup has probably changed — fix the parser rather than shipping a gutted squad.`,
      );
    }
    const stats = parseStats(await get(`/${c.slug}/leistungsdaten/verein/${c.id}/plus/1?saison_id=${season}`));
    // Two honest caveats about this line. The performance page without `reldata` is the
    // ALL-COMPETITIONS total, so a Grêmio player's 37 games include the Libertadores and the Gauchão,
    // not just the league — it is stamped with this competition because that is the snapshot's
    // primary one, and it is used as "how established is this player", which is what the total
    // answers best. Minutes are not published here at all, so they are estimated from apps.
    const withStats: RawPlayer[] = squad.map((p) => {
      const s = stats.get(p.id.replace(/^tm-/, ""));
      const line: RawStatLine = {
        source: "transfermarkt",
        competitionId: spec.id,
        seasonId: season,
        appearances: s?.apps ?? 0,
        minutes: (s?.apps ?? 0) * 80,
        goals: s?.goals ?? 0,
        assists: s?.assists ?? 0,
        yellow: s?.yellow ?? 0,
        red: s?.red ?? 0,
      };
      return { ...p, stats: [line] };
    });
    let meta: ReturnType<typeof parseClubMeta> = {};
    try {
      meta = parseClubMeta(await get(`/${c.slug}/datenfakten/verein/${c.id}`));
    } catch {
      /* metadata is best-effort */
    }
    clubs.push({
      id: c.id,
      name: c.name,
      shortName: shortName(c.name),
      country: "Brazil",
      stadium: meta.stadium,
      capacity: meta.capacity,
      foundedYear: meta.founded,
      crest: await fetchDataUri(`${CDN}/wappen/medium/${c.id}.png`),
      competitionIds: [spec.id, ...cupIds],
    });
    players.push(...withStats);
    const played = withStats.filter((p) => (p.stats?.[0]?.appearances ?? 0) > 0).length;
    console.log(`  ${c.name.padEnd(38)} ${String(withStats.length).padStart(2)} players (${played} w/ apps)${meta.stadium ? ` · ${meta.stadium}` : ""}`);
  }

  const clubIds = clubs.map((c) => c.id);
  const competitions: RawCompetition[] = [
    {
      id: spec.id,
      name: spec.name,
      type: "league",
      country: "Brazil",
      tier: spec.tier,
      seasonId: season,
      format: { twoLegged: false },
      logo: leagueLogo,
      entrantClubIds: clubIds,
    },
    ...spec.cups.map((cup) => ({
      id: cup.id,
      name: cup.name,
      type: "cup" as const,
      country: "Brazil",
      seasonId: season,
      format: { twoLegged: cup.twoLegged },
      entrantClubIds: clubIds,
    })),
  ];
  const snapshot: RawSnapshot = { primaryCompetitionId: spec.id, competitions, clubs, players };

  const out = resolve(dirname(fileURLToPath(import.meta.url)), spec.dataset, "raw.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\n✓ Wrote ${clubs.length} clubs / ${players.length} players → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
