import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHeadCoach } from "../src/scrape/transfermarktHtml.js";
import type { RawCoach, RawSnapshot } from "../src/raw/RawSnapshot.js";

/**
 * The head coach of every club in a snapshot, from Transfermarkt's staff pages.
 *
 * A layer of its own, written to `coaches.json` beside `raw.json`, because that is how every other fact
 * this pipeline adds after the squads is kept: one command, one file, no command overwriting another's
 * (see the table in the README). It also means a coaching change can be re-fetched in forty requests
 * without touching a single squad.
 *
 * WHY A SEPARATE PAGE AT ALL. The coach is not on the club profile — that page carries squad size,
 * average age and stadium, and contains the words "trainer", "manager" and "head coach" exactly zero
 * times. `/mitarbeiter/verein/{id}` is where the staff live. Checked before writing this: TheSportsDB's
 * team record has 64 fields and none of them names a manager, and FMInside's `/staff` is a shell with
 * none of the filter-and-table machinery its player database uses.
 *
 * The club id alone addresses the page — the slug in the URL is decoration and a dummy one still
 * resolves — which is what makes this runnable straight off `raw.json`, where no slug is stored.
 *
 * RESUMABLE, and that was not foresight. The first real run died on a `504 Gateway Time-out` at the
 * seventh of twenty clubs, and because the file was written only at the end, six clubs' worth of
 * requests went in the bin. It now saves after every club and skips whatever `coaches.json` already
 * has, so a rerun costs only what is missing. `--refresh` starts over, for when a manager has changed.
 *
 *   npx tsx packages/dataset/data/scrapeCoaches.ts --dataset=packages/dataset/data/brasileirao-serie-a
 */

const BASE = "https://www.transfermarkt.us";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
/** Polite spacing between requests. The same courtesy the squad scrape extends. */
const DELAY_MS = 1_500;
const MAX_ATTEMPTS = 4;
const SOURCE = "transfermarkt";
const VERSION = "staff-1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch one page, retrying what is worth retrying.
 *
 * Only 5xx and network faults. A 404 is an ANSWER — the club id is wrong or the page moved — and
 * hammering it would neither fix it nor teach us anything, so it fails immediately and loudly.
 */
async function get(path: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en" } });
    if (res.status >= 500) throw new Error(`${res.status} ${res.statusText}`);
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText} for ${path}`), { fatal: true });
    return res.text();
  } catch (e) {
    if ((e as { fatal?: boolean }).fatal || attempt >= MAX_ATTEMPTS) throw e;
    const wait = DELAY_MS * 2 ** attempt;
    console.log(`    retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms — ${e instanceof Error ? e.message : e}`);
    await sleep(wait);
    return get(path, attempt + 1);
  }
}

interface CoachesFile {
  readonly source: string;
  readonly version: string;
  readonly coaches: readonly RawCoach[];
}

function parseArgs(argv: readonly string[]): { dataset: string; refresh: boolean } {
  const dataset = argv.find((a) => a.startsWith("--dataset="))?.slice("--dataset=".length);
  if (!dataset) {
    console.error("Missing --dataset=<dir containing raw.json> [--refresh]");
    process.exit(1);
  }
  return { dataset, refresh: argv.includes("--refresh") };
}

/** What a previous run got, so this one resumes instead of starting over. */
function existing(dataset: string): Map<string, RawCoach> {
  const path = resolve(dataset, "coaches.json");
  if (!existsSync(path)) return new Map();
  const file = JSON.parse(readFileSync(path, "utf8")) as CoachesFile;
  return new Map(file.coaches.map((c) => [c.clubId, c]));
}

async function main(): Promise<void> {
  const { dataset, refresh } = parseArgs(process.argv.slice(2));
  const snapshot: RawSnapshot = JSON.parse(readFileSync(resolve(dataset, "raw.json"), "utf8"));
  const byClub = refresh ? new Map<string, RawCoach>() : existing(dataset);
  const target = resolve(dataset, "coaches.json");
  console.log(`${snapshot.clubs.length} clubs in ${dataset}${byClub.size > 0 ? `, ${byClub.size} already known` : ""}`);

  const save = () => {
    const coaches = [...byClub.values()].sort((a, b) => (a.clubId < b.clubId ? -1 : 1));
    writeFileSync(target, `${JSON.stringify({ source: SOURCE, version: VERSION, coaches }, null, 2)}\n`);
  };

  const vacant: string[] = [];
  let fetched = 0;
  for (const club of snapshot.clubs) {
    if (byClub.has(club.id)) continue;
    // A dummy slug on purpose: the id is what resolves, and inventing a slug from the club name would
    // be one more thing to get wrong for no benefit.
    const coach = parseHeadCoach(await get(`/x/mitarbeiter/verein/${club.id}`), club.id);
    fetched++;
    if (coach) {
      byClub.set(club.id, coach);
      save();
      console.log(`  ${club.name.padEnd(40)} → ${coach.name}${coach.age ? ` (${coach.age}, ${coach.nationality ?? "?"})` : ""}`);
    } else {
      // Not an error: a club between managers genuinely has none, and the emitter omits the name rather
      // than inventing one. Reported so a scrape that silently found nothing cannot pass for a scrape
      // that found nobody was appointed.
      vacant.push(club.name);
      console.log(`  ${club.name.padEnd(40)} → (no Manager listed)`);
    }
    await sleep(DELAY_MS);
  }

  save();
  console.log(`\n✓ ${byClub.size} of ${snapshot.clubs.length} clubs have a head coach (${fetched} fetched now) → ${target}`);
  if (vacant.length > 0) console.log(`  no Manager listed for ${vacant.length}: ${vacant.join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
