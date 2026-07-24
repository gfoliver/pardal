/**
 * Authoring-time scraper (NOT part of the app) that assembles a REAL Brasileirão
 * Série A snapshot from Transfermarkt public pages into the committed RAW file
 * `brasileirao-serie-a/raw.json`. Run once, offline thereafter — the pure
 * pipeline turns this snapshot into the dataset the game loads. Personal, low-
 * volume, polite pacing; data © Transfermarkt (see manifest attribution).
 *
 * `saison_id` 2025 = the current 2025/26 campaign (populated squads).
 * Run: npx tsx packages/dataset/data/scrapeBrasileirao.ts [saison_id]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawClub, RawCompetition, RawPlayer, RawSnapshot, RawStatLine } from "../src/raw/RawSnapshot.js";

const SEASON = process.argv[2] ?? "2025";
const BASE = "https://www.transfermarkt.us";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  await sleep(350); // be polite
  return res.text();
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "€30.00m" / "€800k" / "€2.00bn" → integer EUR. */
function parseValue(s: string | undefined): number | undefined {
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

interface ClubRef { id: string; slug: string; name: string }

/** The 20 participants live in the competition startseite's main `table.items`. */
function extractClubs(html: string): ClubRef[] {
  const i = html.indexOf('<table class="items"');
  const tbl = i >= 0 ? html.slice(i, html.indexOf("</table>", i)) : html;
  const seen = new Map<string, ClubRef>();
  const re = new RegExp(`<a title="([^"]+)" href="/([a-z0-9-]+)/startseite/verein/(\\d+)/saison_id/${SEASON}"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(tbl))) if (!seen.has(m[3]!)) seen.set(m[3]!, { id: m[3]!, slug: m[2]!, name: decode(m[1]!) });
  return [...seen.values()];
}

const STOP = new Set([
  "sociedade", "esportiva", "esporte", "clube", "club", "de", "do", "da", "e", "futebol", "regatas",
  "football", "foot-ball", "associacao", "sport", "fc", "cr", "ec", "sc", "se", "rb", "red", "bull",
  "paulista", "porto", "alegrense", "alegre", "regatas", "of", "and",
]);
function shortName(name: string): string {
  const tokens = name.split(/\s+/).map((t) => t.replace(/[().]/g, "")).filter((t) => t && !STOP.has(stripAccents(t).toLowerCase()));
  const joined = stripAccents((tokens[0] ?? name)).replace(/[^A-Za-z]/g, "");
  return (joined || stripAccents(name)).slice(0, 3).toUpperCase();
}

function parsePlayers(html: string, clubId: string): RawPlayer[] {
  const anchors = [...html.matchAll(/\/([a-z0-9-]+)\/profil\/spieler\/(\d+)"\s*>\s*([^<]+?)\s*<\/a>/g)];
  const players: RawPlayer[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    const id = a[2]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const start = a.index!;
    const end = i + 1 < anchors.length ? anchors[i + 1]!.index! : Math.min(html.length, start + 2600);
    const w = html.slice(start, end);
    const posM = w.match(/<tr>\s*<td>\s*([A-Za-z][A-Za-z\- ]+?)\s*<\/td>\s*<\/tr>/);
    const dobM = w.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})\s*\((\d{1,2})\)/);
    const natM = w.match(/class="flaggenrahmen"[^>]*title="([^"]+)"|title="([^"]+)"[^>]*class="flaggenrahmen"/);
    const heightM = w.match(/(\d),(\d{2})\s*m/);
    const footM = w.match(/>\s*(right|left|both)\s*</i);
    const mvs = [...w.matchAll(/€[\d.,]+(?:m|k|bn)?/gi)]; // rightmost = current market value
    players.push({
      id: `tm-${id}`,
      name: decode(a[3]!),
      clubId,
      position: posM ? posM[1]!.trim() : "Central Midfield",
      age: dobM ? Number(dobM[2]) : undefined,
      dob: dobM ? dobM[1]! : undefined,
      nationality: [decode(natM?.[1] ?? natM?.[2] ?? "")].filter(Boolean),
      foot: footM ? footM[1]!.toLowerCase() : undefined,
      heightCm: heightM ? Number(heightM[1]) * 100 + Number(heightM[2]) : undefined,
      marketValueEur: parseValue(mvs.at(-1)?.[0]),
      stats: [{ source: "transfermarkt", competitionId: "BRA1", seasonId: SEASON, appearances: 0, minutes: 0, goals: 0, assists: 0 } satisfies RawStatLine],
    });
  }
  return players;
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
  console.log(`Scraping Brasileirão Série A (saison ${SEASON}) from Transfermarkt …`);
  const startseite = await get(`/campeonato-brasileiro-serie-a/startseite/wettbewerb/BRA1/plus/?saison_id=${SEASON}`);
  const clubRefs = extractClubs(startseite);
  console.log(`Found ${clubRefs.length} clubs.`);
  if (clubRefs.length < 18) throw new Error(`Expected ~20 clubs, got ${clubRefs.length}. Startseite markup may have changed.`);

  const clubs: RawClub[] = [];
  const players: RawPlayer[] = [];
  for (const c of clubRefs) {
    const kader = await get(`/${c.slug}/kader/verein/${c.id}/saison_id/${SEASON}/plus/1`);
    const squad = parsePlayers(kader, c.id);
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
      competitionIds: ["BRA1", "BRC"],
    });
    players.push(...squad);
    console.log(`  ${c.name.padEnd(38)} ${String(squad.length).padStart(2)} players${meta.stadium ? ` · ${meta.stadium}` : ""}`);
  }

  const clubIds = clubs.map((c) => c.id);
  const competitions: RawCompetition[] = [
    { id: "BRA1", name: "Brasileirão Série A", type: "league", country: "Brazil", tier: 1, seasonId: SEASON, format: { twoLegged: false }, entrantClubIds: clubIds },
    { id: "BRC", name: "Copa do Brasil", type: "cup", country: "Brazil", seasonId: SEASON, format: { twoLegged: true }, entrantClubIds: clubIds },
  ];
  const snapshot: RawSnapshot = { primaryCompetitionId: "BRA1", competitions, clubs, players };

  const out = resolve(dirname(fileURLToPath(import.meta.url)), "brasileirao-serie-a", "raw.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\n✓ Wrote ${clubs.length} clubs / ${players.length} players → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
