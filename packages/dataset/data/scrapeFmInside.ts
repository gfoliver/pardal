/**
 * Authoring-time scraper (NOT part of the app) for the FMInside attribute dump — the third source
 * layer, and the one that had no scraper.
 *
 *   npx tsx packages/dataset/data/scrapeFmInside.ts --dataset=packages/dataset/data/brasileirao-serie-b
 *   …               --probe        list the league's clubs and one age band, then stop
 *
 * Writes `<dataset>/fminside.json` in the shape `ratings/resolve.ts` consumes: one row per player,
 * `attrs` holding FM's NATIVE 1–20 keyed by the site's own English labels. No scaling here —
 * `ratings/attributes.ts` owns the mapping onto our scale.
 *
 * ## Identity comes from SQUAD OVERLAP, not from names
 *
 * The club box matches loosely across the whole world, and no name rule survives it. Searching
 * "Botafogo" returns eight clubs; "Fortaleza" returns three. `Grêmio` is a subset of
 * `Grêmio Novorizontino`, and `Fortaleza EC` differs from `Fortaleza` by exactly the token a
 * short-name generator exists to throw away. Matching on names produced 116 players for a 28-man
 * Fortaleza and 134 for Novorizontino — the latter being Grêmio of Porto Alegre folded in.
 *
 * Filtering by league does not save it either: FM 26's database is not fully caught up, so a club we
 * have in Série B may sit in FM's Série A, and a player may even be listed at a club he has left.
 *
 * What DOES identify a club is its squad. We hold 639 player names; the right FMInside club shares many
 * of them and a namesake shares none. Measured, and decisive:
 *
 *     Fortaleza        104750 Fortaleza          8/27      76019314 Fortaleza F.C.   0/18
 *     Botafogo (SP)    121265 Botafogo (SP)     17/22           316 Botafogo         0/27
 *                                                          301208 Botafogo da Paraíba 0/25
 *
 * So: search by a distinctive token, group the rows by FM club id, and take the id whose players
 * overlap our squad. It picks Botafogo-SP over the far more famous Botafogo of Rio without being told
 * anything about either.
 *
 * A wrong `tm` on a player is not fatal downstream — `ratings/resolve.ts` matches club-scoped first and
 * falls back to a name unique across the whole dump, which is exactly the "he transferred between the
 * two sources" case. What must not happen is a DIFFERENT club's players being attributed to ours, and
 * that is what the overlap test prevents.
 *
 * ## What the site actually does, all measured
 *
 * `data/FMINSIDE.md` recorded a manual browser session; the site has moved since, and a version of this
 * file written against those notes 404'd on its first request. See that file for the full list. The
 * three that shape the code below:
 *
 *  - **Attributes exist only on a view's FIRST page.** `loadmore=true` advances a cursor but always
 *    returns the General rendering, with no stat cells. So the unit of work is a filter matching at most
 *    fifty players, and the age range is halved until it fits.
 *  - **`view` is sticky session state and must always be sent, empty included.** Omitting it does not
 *    mean General; it means "whatever the last request left behind". That cost a whole run: the first
 *    club worked and every one after it got the Goalkeeper rendering, which has no club anchor.
 *  - **The league filter wants the competition's FULL name.** `CBB` is the code the UI shows and it
 *    matches nothing; `Campeonato Brasileiro Série B` returns the league. `Brasileiro Série B` also
 *    matches nothing, so it is not a substring test.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import { nameKey, type ScrapedPlayer } from "../src/ratings/resolve.js";

const BASE = "https://fminside.net";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const FILTER_URL = "/resources/inc/ajax/update_filter.php";
const TABLE_URL = "/beheer/modules/players/resources/inc/frontend/generate-player-table.php";
/** FM 26, per the `database_version` select on /players. */
const DATABASE_VERSION = "7";
/** Rows one page returns. Attributes exist only on that page, so a query must not exceed it. */
const PAGE_SIZE = 50;
/** The four views that carry attributes. `General` carries the club instead. */
const ATTR_VIEWS = ["Technical", "Mental", "Physical", "Goalkeeper"] as const;
/** The whole age span a squad can cover. Halved as needed — see `collectLeague`. */
const AGE_RANGE: readonly [number, number] = [14, 60];

/**
 * How many of our squad an FMInside club must share to be accepted as the same club.
 *
 * Three is ample because a namesake scores ZERO — measured across eight Botafogos and three
 * Fortalezas. It is a floor against accident, not a similarity threshold.
 */
const MIN_SQUAD_OVERLAP = 3;

/** Age bands used only to IDENTIFY a club. Two, so a club with nobody in the first is still seen. */
const PROBE_BANDS: readonly (readonly [number, number])[] = [
  [21, 26],
  [27, 33],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The smallest cookie jar that works.
 *
 * Load-bearing, not politeness: the filter POST and the table GET are two requests and the only thing
 * connecting them is the session cookie. Node's `fetch` keeps none, so without this every GET returns
 * the unfiltered 547,000-player default — which looks like a successful scrape of the wrong thing.
 */
const jar = new Map<string, string>();

function absorb(res: Response): void {
  // `getSetCookie` keeps them separate; a joined header cannot be split safely because `Expires`
  // contains a comma.
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function request(path: string, init?: RequestInit): Promise<string> {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en",
      "X-Requested-With": "XMLHttpRequest",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
    },
  });
  absorb(res);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  await sleep(400); // personal, low-volume, polite
  return res.text();
}

const setFilter = (fields: Record<string, string>): Promise<string> =>
  request(FILTER_URL, {
    method: "POST",
    body: new URLSearchParams({ page: "players", database_version: DATABASE_VERSION, gender: "-1", ...fields }).toString(),
  });

/** One view's first page. `view` is always sent — see the header note on why empty is not the same as absent. */
const viewHtml = (view: string): Promise<string> => request(`${TABLE_URL}?ajax_request=1&view=${view}`);

// --- parsing -------------------------------------------------------------------------------------

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();

/** How many players the current filter matched, per the table's own counter. */
const resultCount = (html: string): number | undefined => {
  const raw = html.match(/num_results"[^>]*title="([^"]*)"/)?.[1];
  const n = raw ? Number(raw.replace(/[^0-9]/g, "")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const playerBlocks = (html: string): string[] =>
  [...html.matchAll(/<ul class="player">[\s\S]*?<\/ul>/g)].map((m) => m[0]!);

/**
 * A view's attribute labels, in column order.
 *
 * Read from the header rather than hard-coded, so a column the site adds or reorders cannot shift every
 * value one attribute to the left. Each `title` reads "Crossing — How accurately…", so the label is the
 * part before the dash.
 */
function viewLabels(html: string): string[] {
  const header = html.match(/<ul class="header">[\s\S]*?<\/ul>/)?.[0] ?? "";
  return [...header.matchAll(/title="([^"]+)"/g)].map((m) => decode(m[1]!).split("—")[0]!.trim()).filter(Boolean);
}

const UID = /href="\/players\/[^"/]*\/(\d+)-[^"]*"[^>]*>([^<]*)/;
const CLUB = /href="\/clubs\/[^"/]*\/(\d+)-[^"]*"[^>]*>(?:<img[^>]*>)?\s*([^<]*)/;

interface Row {
  readonly uid: string;
  readonly name: string;
  readonly clubId?: string;
  readonly clubName?: string;
  /** From `<li class="age">26</li>` on the General view — the only thing that separates namesakes. */
  readonly age?: number;
  readonly stats: readonly number[];
}

function parseRow(block: string): Row | null {
  const who = block.match(UID);
  if (!who) return null;
  const club = block.match(CLUB);
  const age = block.match(/<li class="age">\s*(\d{1,2})\s*<\/li>/);
  return {
    uid: who[1]!,
    name: decode(who[2]!),
    clubId: club?.[1],
    clubName: club ? decode(club[2]!) : undefined,
    age: age ? Number(age[1]) : undefined,
    // `<li class="stat"><span class="stat_color great">15</span></li>`, in header order. The TEXT is the
    // native 1–20: the `value_NN` classes the old notes relied on are gone.
    stats: [...block.matchAll(/<li class="stat">\s*<span[^>]*>\s*([\d-]+)\s*<\/span>/g)].map((m) => Number(m[1])),
  };
}

/** Pair a row's stat cells with the view's labels, aligning from the RIGHT. */
function attrsOf(row: Row, labels: readonly string[]): Record<string, number> {
  // The header carries Rating/Ability/Potential before the attributes, so the last N labels are the
  // ones belonging to the N stat cells. Guessing an offset from the front breaks when a view gains a
  // column.
  const useful = labels.slice(labels.length - row.stats.length);
  const out: Record<string, number> = {};
  row.stats.forEach((v, i) => {
    const label = useful[i];
    if (label && Number.isFinite(v)) out[label] = v;
  });
  return out;
}

// --- collecting ----------------------------------------------------------------------------------

interface Collected {
  readonly uid: string;
  readonly name: string;
  readonly clubId: string;
  readonly clubName: string;
  readonly age?: number;
  readonly attrs: Record<string, number>;
}

/**
 * Which FMInside club is ours, decided by how many of our players it has.
 *
 * Returns the best candidate and the whole scoreboard, so a refusal can say what it saw rather than
 * just that it failed.
 */
async function identifyClub(
  term: string,
  ourSquad: ReadonlySet<string>,
): Promise<{ best?: { id: string; name: string; overlap: number; seen: number }; all: { id: string; name: string; overlap: number; seen: number }[] }> {
  const tally = new Map<string, { id: string; name: string; overlap: number; seen: number }>();
  for (const [lo, hi] of PROBE_BANDS) {
    await setFilter({ club: term, min_age: String(lo), max_age: String(hi) });
    const html = await viewHtml("");
    for (const r of playerBlocks(html).map(parseRow)) {
      if (!r?.clubId || !r.clubName) continue;
      const e = tally.get(r.clubId) ?? { id: r.clubId, name: r.clubName, overlap: 0, seen: 0 };
      e.seen += 1;
      if (ourSquad.has(nameKey(r.name))) e.overlap += 1;
      tally.set(r.clubId, e);
    }
  }
  const all = [...tally.values()].sort((a, b) => b.overlap - a.overlap || b.seen - a.seen);
  const best = all[0];
  // Strictly better than the runner-up: a tie means the signal did not decide, and guessing between two
  // clubs is how another club's squad ends up in ours.
  const decisive = best && best.overlap >= MIN_SQUAD_OVERLAP && (all[1] === undefined || best.overlap > all[1].overlap);
  return { best: decisive ? best : undefined, all };
}

/**
 * Every player of ONE club, with attributes, by narrowing the age range until each query fits a page.
 *
 * Filtered by the club's EXACT FMInside name and then kept by its ID, so a loose name match cannot
 * attribute another club's players to it — the mistake that put 116 players in a 28-man Fortaleza.
 * Halving the age range needs no per-club tuning and cannot truncate silently: a slice that still
 * overflows at a single year of age throws rather than contributing its first fifty.
 */
async function collectClub(fmName: string, fmId: string): Promise<{ players: Collected[]; requests: number }> {
  const players = new Map<string, Collected>();
  const todo: [number, number][] = [[AGE_RANGE[0], AGE_RANGE[1]]];
  let requests = 0;

  while (todo.length > 0) {
    const [lo, hi] = todo.pop()!;
    await setFilter({ club: fmName, min_age: String(lo), max_age: String(hi) });
    const general = await viewHtml("");
    requests += 2;
    const expected = resultCount(general) ?? 0;

    if (expected > PAGE_SIZE) {
      if (lo >= hi) {
        throw new Error(`${fmName}: ${expected} players all aged ${lo} — one page cannot hold them.`);
      }
      const mid = Math.floor((lo + hi) / 2);
      todo.push([lo, mid], [mid + 1, hi]);
      continue;
    }

    const rows = playerBlocks(general).map(parseRow).filter((r): r is Row => r !== null);
    const mine = rows.filter((r) => r.clubId === fmId);
    if (mine.length === 0) continue;

    const attrs = new Map<string, Record<string, number>>();
    for (const view of ATTR_VIEWS) {
      const html = await viewHtml(view);
      requests += 1;
      const labels = viewLabels(html);
      for (const r of playerBlocks(html).map(parseRow).filter((r): r is Row => r !== null)) {
        attrs.set(r.uid, { ...(attrs.get(r.uid) ?? {}), ...attrsOf(r, labels) });
      }
    }

    for (const r of mine) {
      const a = attrs.get(r.uid) ?? {};
      // Abort rather than lower the total: a player with no attributes means the views stopped lining
      // up, which is the failure that once hid 111 players behind a plausible coverage number.
      if (Object.keys(a).length === 0) {
        throw new Error(`${fmName}: ${r.name} (${r.uid}) came back with no attributes in ages ${lo}-${hi}.`);
      }
      players.set(r.uid, { uid: r.uid, name: r.name, clubId: fmId, clubName: fmName, age: r.age, attrs: a });
    }
  }
  return { players: [...players.values()], requests };
}

// --- picking a search term ----------------------------------------------------------------------

const STOP = new Set([
  "sociedade", "esportiva", "esporte", "esportes", "clube", "club", "de", "do", "da", "e", "futebol",
  "regatas", "football", "associacao", "sport", "fc", "ec", "sc", "se", "cr", "rb", "red", "bull",
  "atletico", "atletica",
]);

/**
 * Clubs whose FMInside name shares no token with ours, keyed by `nameKey` of OUR name.
 *
 * Only for the cases where the search itself cannot reach the club — not for disambiguation, which the
 * overlap test does. `Clube de Regatas Brasil` is filed as "CRB": searching "Brasil" returns Desportivo
 * Brasil, Brasil de Pelotas and Aster Brasil, all at zero overlap, and no token of our name leads
 * anywhere near it. A wrong hint here is still caught, because the overlap test runs on whatever the
 * search returns.
 */
const SEARCH_HINT: Record<string, string> = {
  "clube de regatas brasil al": "CRB",
};

/**
 * What to type into the club box for one of our clubs.
 *
 * Only ever a QUERY, never an identity claim — the overlap test decides which of the results is ours,
 * so this just has to be loose enough to find the club. The FIRST meaningful token, because Portuguese
 * club names lead with the part the club is known by and trail into the legal form: "Clube Náutico
 * Capibaribe" gives "Náutico" (11 results) where the longest token gives "Capibaribe" (zero).
 */
function searchTerm(name: string): string {
  const hint = SEARCH_HINT[nameKey(name)];
  if (hint) return hint;
  const cleaned = name.replace(/\([^)]*\)/g, " ");
  const tokens = cleaned.split(/\s+/).map((t) => t.replace(/[().,-]/g, "")).filter(Boolean);
  const meaningful = tokens.filter((t) => !STOP.has(nameKey(t)));
  return meaningful[0] ?? tokens[0] ?? name;
}

// --- main ----------------------------------------------------------------------------------------

function parseArgs(argv: readonly string[]): { dataset: string; probe: boolean; out?: string } {
  const flags: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]!] = m[2] ?? "true";
  }
  if (!flags.dataset) throw new Error("Missing --dataset=<dir> (the directory holding raw.json)");
  return { dataset: flags.dataset, probe: flags.probe === "true", out: flags.out };
}

async function main(): Promise<void> {
  const { dataset, probe, out } = parseArgs(process.argv.slice(2));
  const snapshot: RawSnapshot = JSON.parse(readFileSync(resolve(dataset, "raw.json"), "utf8"));
  const ours = snapshot.clubs.map((c) => ({
    id: c.id,
    name: c.name,
    term: searchTerm(c.name),
    squad: new Set(snapshot.players.filter((p) => p.clubId === c.id).map((p) => nameKey(p.name))),
  }));
  console.log(`${ours.length} clubs in ${dataset}`);

  // Warm a session: the cookie is what carries the filter to the table request.
  await request("/players");

  const identified: { our: (typeof ours)[number]; fm: { id: string; name: string; overlap: number; seen: number } }[] = [];
  const unidentified: string[] = [];
  for (const our of ours) {
    const { best, all } = await identifyClub(our.term, our.squad);
    if (!best) {
      unidentified.push(`${our.name} (searched "${our.term}"; best: ${all.slice(0, 3).map((c) => `${c.name} ${c.overlap}/${c.seen}`).join(", ") || "nothing"})`);
      continue;
    }
    identified.push({ our, fm: best });
    console.log(`  ${our.name.padEnd(40)} → ${best.name} (${best.id}) · overlap ${best.overlap}/${best.seen}`);
  }
  /*
   * The identification is WORTH KEEPING, not just worth logging.
   *
   * FM's own club name is the display name the game needs — "Ponte Preta", "CRB", "Sport Recife",
   * "Botafogo (SP)" — and it falls out of the overlap test for free, in both probe and full runs.
   * Written every run so it can never be stale relative to the ratings beside it, and written before
   * the attribute collection below so `--probe` produces it too: naming forty clubs correctly costs
   * one cheap run instead of the full scrape.
   */
  const clubsFile = resolve(dataset, "fmclubs.json");
  writeFileSync(
    clubsFile,
    JSON.stringify(
      {
        source: "fminside",
        version: `fm-db-${DATABASE_VERSION}`,
        clubs: Object.fromEntries(identified.map(({ our, fm }) => [our.id, { fmId: fm.id, name: fm.name }])),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n✓ Named ${identified.length} clubs → ${clubsFile}`);

  if (unidentified.length > 0) {
    // Reported, not fatal: a club the overlap test cannot settle has no ratings, and `applyRatings`
    // rescales the players a source never covered rather than treating absence as excellence.
    console.log(`\ncould not identify ${unidentified.length} club(s):`);
    for (const u of unidentified) console.log(`  ${u}`);
  }
  if (probe) return;

  const dump: ScrapedPlayer[] = [];
  let requests = 0;
  console.log("");
  for (const { our, fm } of identified) {
    const got = await collectClub(fm.name, fm.id);
    requests += got.requests;
    for (const p of got.players) dump.push({ tm: our.id, uid: p.uid, name: p.name, age: p.age, attrs: p.attrs });
    const covered = got.players.filter((p) => our.squad.has(nameKey(p.name))).length;
    console.log(`  ${our.name.padEnd(40)} ${String(got.players.length).padStart(3)} players · ${covered}/${our.squad.size} of our squad`);
  }

  // `--out` so a run can be MEASURED against the dump it would replace before replacing it. See
  // `compareRatings.ts`: entry count is not the question, resolved players is.
  const target = out ? resolve(out) : resolve(dataset, "fminside.json");
  writeFileSync(target, JSON.stringify(dump, null, 2) + "\n");
  console.log(`\n✓ Wrote ${dump.length} players from ${identified.length} clubs in ${requests} requests → ${target}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
