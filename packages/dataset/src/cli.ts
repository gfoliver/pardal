/**
 * On-demand dataset assembler — SEPARATE commands the user runs to build a
 * personal dataset. Not part of the app build; never invoked at runtime.
 *
 *   # squads, market values and stats (Transfermarkt)
 *   npx tsx packages/dataset/src/cli.ts build --competition=BRA1 --season=2025 \
 *       --out=./datasets --tm-api=http://localhost:8000
 *   npx tsx packages/dataset/src/cli.ts build --from-raw=<raw.json> --out=./datasets
 *
 *   # identity: photos, club colours, stadium, bio (TheSportsDB) — incremental
 *   npx tsx packages/dataset/src/cli.ts enrich --dataset=./datasets/<slug>
 *
 * The split is deliberate. `build` writes `raw.json`; `enrich` writes
 * `enrichment.json`; NEITHER writes the other's file. So re-scraping squads
 * cannot throw away twenty rate-limited minutes of enrichment, and re-enriching
 * cannot stale the squads. Both layers feed the same pure pipeline at emit time.
 *
 * `--from-raw` recomputes the artifact from existing layers WITHOUT refetching —
 * the path to run after the inference formulas change.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { TransfermarktSource } from "./sources/TransfermarktSource.js";
import { TheSportsDbSource } from "./sources/TheSportsDbSource.js";
import { mergeSources } from "./sources/mergeSources.js";
import { buildArtifact, loadRawSnapshot, writeArtifact, writeConsumable } from "./artifact/store.js";
import { ARTIFACT_FILES, type SourceRef } from "./artifact/DatasetArtifact.js";
import { EnrichmentStore, enrichmentPath, readEnrichment } from "./enrich/EnrichmentStore.js";
import { enrichmentToPartial } from "./enrich/enrichmentToPartial.js";
import { planWork } from "./enrich/plan.js";
import { RatingsStore, loadRatingsFor, ratingsPath, ratingsMapOf } from "./ratings/store.js";
import { FIXED_STAMP, resolveScrapedRatings, type ScrapedPlayer } from "./ratings/resolve.js";
import type { RawCoach, RawSnapshot } from "./raw/RawSnapshot.js";

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
  const [cmd = "build", ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const a of rest) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]!] = m[2] ?? "true";
  }
  return { cmd, flags };
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const isTrue = (v: string | undefined) => v !== undefined && v !== "false" && v !== "0";

const USAGE = `Usage:
  build   [--from-raw=<path>[,<path>…] | --competition=<code> --tm-api=<url>] [--season=]
          [--out=<dir>] [--slug=] [--name=] [--emit-to=<dir>]
          (several --from-raw paths are MERGED — one snapshot per division builds a pyramid)
  enrich  --dataset=<dir> [--max=<n>] [--deep] [--retry-misses] [--missing-photos]
          [--no-names] [--tsdb-key=] [--tsdb-delay=<ms>] [--emit-to=<dir>] [--no-emit]
  ratings --dataset=<dir> --from=<scrape.json> [--source=] [--source-version=]
          [--emit-to=<dir>] [--no-emit]`;

/**
 * Fold the cached enrichment layer (when there is one) into a snapshot. Pure:
 * an absent file simply means no enrichment, and the artifact is what it would
 * have been before this feature existed.
 */
/**
 * Load the cached ratings layer, if there is one. Absent simply means the
 * attributes stay inferred, exactly as before this source existed.
 */
/**
 * The ratings layers of every directory being built from, unioned.
 *
 * A list rather than one directory, because a pyramid is assembled from one snapshot per division and
 * each division has its own `fminside.json` beside its own `raw.json`. The maps are keyed by our
 * player id and the divisions are disjoint, so a plain union is exactly right — and if they ever did
 * overlap, the later directory winning is the same rule the rest of the merge uses.
 */
function withRatings(dirs: readonly string[]): { map?: ReturnType<typeof ratingsMapOf>; sources: SourceRef[] } {
  const map = new Map<string, ReturnType<typeof ratingsMapOf> extends Map<string, infer V> ? V : never>();
  const sources: SourceRef[] = [];
  for (const dir of dirs) {
    const file = loadRatingsFor(dir);
    if (!file) continue;
    const one = ratingsMapOf(file);
    if (one.size === 0) continue;
    for (const [id, rated] of one) map.set(id, rated);
    console.log(`  + ratings from ${file.source} (${one.size} players) — ${dir}`);
    sources.push({ id: file.source, version: file.version, fetchedAt: "cached" });
  }
  return { map: map.size > 0 ? map : undefined, sources };
}

/**
 * The club DISPLAY NAMES the ratings source published, folded in as a partial.
 *
 * A separate file from `ratings.json` because it is a separate fact about a separate entity: one is
 * every player's attributes, this is forty club names, and the scraper can produce this one alone
 * (`--probe`) without the full attribute crawl. Absent simply means the names fall back to curation
 * and derivation, which is what every dataset did before this layer existed.
 */
function withClubNames(snapshot: RawSnapshot, dirs: readonly string[]): { snapshot: RawSnapshot; sources: SourceRef[] } {
  let current = snapshot;
  const sources: SourceRef[] = [];
  for (const dir of dirs) {
    const path = join(dir, "fmclubs.json");
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      source: string;
      version: string;
      clubs: Record<string, { name: string }>;
    };
    const named = Object.entries(file.clubs);
    if (named.length === 0) continue;
    /*
     * Built FROM the existing clubs rather than as bare `{ id, nickname }` records. `overlay` skips
     * `undefined` but not `""` or `[]`, so a synthesised partial with a placeholder `name` and empty
     * `competitionIds` — both required by `RawClub` — would erase the real ones.
     */
    const nicknames = new Map(named.map(([id, c]) => [id, c.name]));
    current = mergeSources([
      current,
      { clubs: current.clubs.filter((c) => nicknames.has(c.id)).map((c) => ({ ...c, nickname: nicknames.get(c.id)! })) },
    ]);
    console.log(`  + club names from ${file.source} (${named.length} clubs) — ${dir}`);
    sources.push({ id: file.source, version: file.version, fetchedAt: "cached" });
  }
  return { snapshot: current, sources };
}

/**
 * The head coaches, folded in from `coaches.json`.
 *
 * A layer beside the ratings and the club names rather than part of `raw.json`, because it is scraped
 * by its own command from its own page — Transfermarkt keeps the staff on `/mitarbeiter/verein/{id}`,
 * not on the club profile. Absent simply means no club has a named coach, which is what the artifact
 * said for its whole life before this: the emitter used to fill the gap with `${club.name} Coach`, an
 * age of 50 and the nationality "Brazil".
 */
function withCoaches(snapshot: RawSnapshot, dirs: readonly string[]): { snapshot: RawSnapshot; sources: SourceRef[] } {
  let current = snapshot;
  const sources: SourceRef[] = [];
  for (const dir of dirs) {
    const path = join(dir, "coaches.json");
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, "utf8")) as { source: string; version: string; coaches: RawCoach[] };
    if (!file.coaches?.length) continue;
    // Only clubs the snapshot has, so a stale coaches file cannot introduce a club with no squad.
    const have = new Set(current.clubs.map((c) => c.id));
    current = mergeSources([current, { coaches: file.coaches.filter((c) => have.has(c.clubId)) }]);
    console.log(`  + coaches from ${file.source} (${file.coaches.length} clubs) — ${dir}`);
    sources.push({ id: file.source, version: file.version, fetchedAt: "cached" });
  }
  return { snapshot: current, sources };
}

/** The identity layers of every directory being built from, folded in one at a time. */
function withEnrichment(snapshot: RawSnapshot, dirs: readonly string[]): { snapshot: RawSnapshot; sources: SourceRef[] } {
  let current = snapshot;
  const sources: SourceRef[] = [];
  for (const dir of dirs) {
    const file = readEnrichment(enrichmentPath(dir));
    if (!file) continue;
    current = mergeSources([current, enrichmentToPartial(current, file)]);
    const players = Object.values(file.players).filter((r) => r.status === "matched").length;
    console.log(`  + enrichment from ${file.source} (${players} players) — ${dir}`);
    sources.push({ id: file.source, version: file.version, fetchedAt: "cached" });
  }
  return { snapshot: current, sources };
}

async function build(flags: Record<string, string>): Promise<void> {
  const out = flags.out ?? "./datasets";
  const now = new Date().toISOString();

  let snapshot: RawSnapshot;
  let sources: SourceRef[];
  /** Where existing enrichment/ratings layers for this build would live — one directory per snapshot. */
  let existingDirs: string[] | undefined;

  if (flags["from-raw"]) {
    /*
     * A COMMA-SEPARATED list, because a pyramid is built from one snapshot per division.
     * `mergeSources` unions them — including the domestic cup both divisions enter — and each
     * snapshot's own enrichment and ratings layers are folded in from beside it.
     *
     * Pass `--slug`/`--name` for a combined build: they default to the PRIMARY competition's name,
     * which for a Série A + Série B build would label the whole pyramid "Série A".
     */
    const paths = flags["from-raw"].split(",").map((p) => p.trim()).filter(Boolean);
    snapshot = paths.length === 1 ? loadRawSnapshot(paths[0]!) : mergeSources(paths.map(loadRawSnapshot));
    sources = [{ id: "raw-file", version: "1", fetchedAt: now }];
    existingDirs = paths.map((p) => dirname(p));
    console.log(`Recomputing from ${paths.length} snapshot(s): ${paths.join(", ")} (no network).`);
  } else {
    const competition = flags.competition;
    if (!competition) {
      console.error(`Missing --competition=<code> (e.g. BRA1) or --from-raw=<path>.\n${USAGE}`);
      process.exit(1);
    }
    const src = new TransfermarktSource(flags["tm-api"] ?? "http://localhost:8000", { delayMs: Number(flags.delay ?? 0) });
    console.log(`Fetching ${competition} from ${src.id} … (this may take a while)`);
    snapshot = mergeSources([await src.fetchCompetition(competition, flags.season)]);
    sources = [{ id: src.id, version: src.version, fetchedAt: now }];
  }

  const name = flags.name ?? snapshot.competitions.find((c) => c.id === snapshot.primaryCompetitionId)?.name ?? snapshot.primaryCompetitionId;
  const slug = flags.slug ?? slugify(name);
  // A fresh build hasn't got a directory yet — look where this dataset lands.
  const layerDirs = existingDirs ?? [join(out, slug)];
  const named = withClubNames(snapshot, layerDirs);
  sources = [...sources, ...named.sources];
  const coached = withCoaches(named.snapshot, layerDirs);
  sources = [...sources, ...coached.sources];
  const enriched = withEnrichment(coached.snapshot, layerDirs);
  sources = [...sources, ...enriched.sources];

  // `snapshot` stays pristine and is what lands back in raw.json; only the
  // pipeline sees the enriched version.
  const ratings = withRatings(layerDirs);
  sources = [...sources, ...ratings.sources];

  const { artifact, report, ratings: ratingsReport } = buildArtifact(snapshot, {
    name, slug, sources, effective: enriched.snapshot, datasetVersion: flags.version, note: flags.note,
    ratings: ratings.map,
  });
  const dir = writeArtifact(out, artifact);
  // The app bundles only manifest/league/world, so `--emit-to` drops that
  // subset straight where it is imported from.
  if (flags["emit-to"]) console.log(`  → app copy: ${writeConsumable(flags["emit-to"], artifact)}`);

  const { manifest } = artifact;
  console.log(`\n✓ Wrote dataset "${manifest.name}" → ${dir}`);
  console.log(`  ${manifest.counts.clubs} clubs · ${manifest.counts.players} players · ${manifest.counts.competitions} competitions`);
  if (ratingsReport) {
    const r = ratingsReport;
    const t = (x: { scale: number; offset: number }) =>
      `×${x.scale.toFixed(3)} ${x.offset >= 0 ? "+" : "−"}${Math.abs(x.offset).toFixed(1)}`;
    console.log(
      `  ratings: ${r.rated} real (overall mean ${r.ratedMean.toFixed(1)}, sd ${r.ratedSd.toFixed(2)}) · ` +
        `${r.backfilled} inferred, rescaled ${t(r.backfillTransform)}`,
    );
    // Where this league landed on our scale. A fixed curve off a global source scale means this
    // number is meaningful across competitions: a stronger league SHOULD read higher.
    console.log(
      `           sourced attrs on our scale: mean ${r.sourceAttributeMean.toFixed(1)}, sd ${r.sourceAttributeSd.toFixed(2)}`,
    );
  }
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  if (report.errors.length) {
    for (const e of report.errors) console.error(`  ✗ ${e}`);
    console.error(`\n${report.errors.length} validation error(s). Artifact written but not career-ready.`);
    process.exit(2);
  }
}

async function enrich(flags: Record<string, string>): Promise<void> {
  const dir = flags.dataset;
  if (!dir) {
    console.error(`Missing --dataset=<dir> (the folder holding raw.json).\n${USAGE}`);
    process.exit(1);
  }
  const snapshot = loadRawSnapshot(join(dir, ARTIFACT_FILES.raw));
  const src = new TheSportsDbSource({
    key: flags["tsdb-key"],
    delayMs: flags["tsdb-delay"] ? Number(flags["tsdb-delay"]) : undefined,
    nameSearch: !isTrue(flags["no-names"]),
  });

  const store = new EnrichmentStore(enrichmentPath(dir), src.id, src.version);
  const plan = planWork(snapshot, store.snapshot(), {
    deep: isTrue(flags.deep),
    retryMisses: isTrue(flags["retry-misses"]),
    retryPhotoless: isTrue(flags["missing-photos"]),
    max: flags.max ? Number(flags.max) : undefined,
    sourceVersion: src.version,
  });

  const todo = plan.clubs.length + plan.players.length;
  console.log(`Enriching ${dir} from ${src.id}`);
  console.log(`  ${plan.clubs.length} clubs · ${plan.players.length} players to fetch` +
    ` (skipping ${plan.skipped.alreadyDone} already done, ${plan.skipped.knownMisses} known misses)`);
  if (plan.deferred) console.log(`  ${plan.deferred} deferred by --max — re-run to continue`);
  if (todo === 0) {
    console.log("\n✓ Nothing to do — everything cached.");
    return;
  }
  console.log(`  ~${Math.ceil((todo * 2.2) / 60)} min at the free tier's 30 req/min\n`);

  let outcome;
  try {
    outcome = await src.run(
      snapshot,
      plan,
      {
        club: (id, rec) => store.putClub(id, { ...rec, depth: "roster" }),
        // Both paths are additive on purpose: a match MERGES (a name pass must
        // not erase physicals a roster pass found), and a miss never downgrades
        // a record we already matched.
        player: (id, rec) =>
          rec.status === "matched" && rec.data
            ? store.mergePlayer(id, rec.data, rec.depth, rec.sourceId ?? "", rec.fetchedAt)
            : store.missPlayer(id, rec.fetchedAt),
        current: () => store.snapshot(),
      },
      (m) => console.log(m),
    );
  } finally {
    store.flush(); // never lose progress, even on a crash
  }

  const cached = store.snapshot();
  const withPhoto = Object.values(cached.players).filter((r) => r.data?.photo).length;
  console.log(`\n✓ ${outcome.requests} requests`);
  console.log(`  clubs   ${outcome.clubsMatched} matched · ${outcome.clubsMissed} missed`);
  console.log(`  players ${outcome.playersMatched} matched · ${outcome.playersMissed} missed`);
  console.log(`  photos  ${withPhoto}/${snapshot.players.length} of the squad`);
  for (const a of outcome.ambiguous) console.log(`  ⚠ ambiguous, refused: ${a}`);
  for (const e of outcome.errors.slice(0, 10)) console.log(`  ✗ ${e}`);

  if (isTrue(flags["no-emit"])) return;
  // Pin the slug to the directory we were pointed at, so the re-emit lands back
  // on this dataset instead of deriving a new folder from the league's name.
  await build({
    "from-raw": join(dir, ARTIFACT_FILES.raw),
    out: dirname(dir),
    slug: basename(dir),
    ...(flags["emit-to"] ? { "emit-to": flags["emit-to"] } : {}),
    ...(flags.version ? { version: flags.version } : {}),
  });
}

/**
 * Resolve a scraped ratings dump onto our players.
 *
 * Writes ONLY `ratings.json`. Never touches `raw.json` or `enrichment.json` — the same rule the
 * other two commands follow, so any layer can be rebuilt without costing the others.
 *
 * The fetch is NOT here, unlike the source this replaced. FMInside filters by server-side
 * session rather than by query parameters and renders squads in JS, so the dump is produced by
 * driving a browser and lands as a file; this command is the cheap deterministic half, re-runnable
 * whenever the join rule improves without re-fetching anything.
 */
async function ratings(flags: Record<string, string>): Promise<void> {
  const dir = flags.dataset;
  const dump = flags.from;
  if (!dir || !dump) {
    console.error(`Missing --dataset=<dir> and/or --from=<scrape.json>.
${USAGE}`);
    process.exit(1);
  }
  const snapshot = loadRawSnapshot(join(dir, ARTIFACT_FILES.raw));
  /*
   * SEVERAL dumps, comma-separated, concatenated before resolving.
   *
   * Measured: resolving one division against its own dump matched 395 of 639 players; against both
   * divisions' dumps, 433. The whole gain is on the cross-club path — FM files a player at the club he
   * has since left, and the other division's dump is where he turns up. Costs no requests.
   */
  const dumpPaths = dump.split(",").map((p) => p.trim()).filter(Boolean);
  const scraped: ScrapedPlayer[] = dumpPaths.flatMap((p) => JSON.parse(readFileSync(p, "utf8")) as ScrapedPlayer[]);
  const store = new RatingsStore(ratingsPath(dir), flags.source ?? "fminside", flags["source-version"] ?? "fm-26.2", loadRatingsFor(dir));
  const outcome = resolveScrapedRatings(snapshot, scraped, store, flags.stamp ?? FIXED_STAMP);
  store.flush();

  console.log(`✓ Wrote ${ratingsPath(dir)}`);
  const total = snapshot.players.length;
  console.log(`  players rated : ${outcome.matched}/${total} (${((outcome.matched / Math.max(1, total)) * 100).toFixed(0)}%)`);
  console.log(
    `    by club+name: ${outcome.byClubName}   by unique name: ${outcome.byUniqueName}   by name+age: ${outcome.byNameAndAge}`,
  );
  console.log(
    `  unrated       : ${outcome.notInDump} absent from the dump, ${outcome.incomplete} refused for missing labels, ` +
      `${outcome.wrongPosition} refused because the row is a different kind of footballer`,
  );
  console.log(`                  these keep inferred attributes, rescaled onto the rated population`);

  if (!isTrue(flags["no-emit"])) {
    console.log("\nRebuilding the artifact from all three layers …");
    await build({
      "from-raw": join(dir, ARTIFACT_FILES.raw),
      out: dirname(dir),
      slug: basename(dir),
      ...(flags["emit-to"] ? { "emit-to": flags["emit-to"] } : {}),
      ...(flags.version ? { version: flags.version } : {}),
    });
  }
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (cmd === "build") return build(flags);
  if (cmd === "enrich") return enrich(flags);
  if (cmd === "ratings") return ratings(flags);
  console.error(`Unknown command "${cmd}".\n${USAGE}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
