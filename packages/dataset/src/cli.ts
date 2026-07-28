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
import { basename, dirname, join } from "node:path";
import { TransfermarktSource } from "./sources/TransfermarktSource.js";
import { TheSportsDbSource } from "./sources/TheSportsDbSource.js";
import { mergeSources } from "./sources/mergeSources.js";
import { buildArtifact, loadRawSnapshot, writeArtifact, writeConsumable } from "./artifact/store.js";
import { ARTIFACT_FILES, type SourceRef } from "./artifact/DatasetArtifact.js";
import { EnrichmentStore, enrichmentPath, readEnrichment } from "./enrich/EnrichmentStore.js";
import { enrichmentToPartial } from "./enrich/enrichmentToPartial.js";
import { planWork } from "./enrich/plan.js";
import { PesRetroSource } from "./sources/PesRetroSource.js";
import { PesStore, loadPesFor, pesPath, ratingsMapOf } from "./pes/store.js";
import { resolveRatings } from "./pes/fetchRatings.js";
import type { RawSnapshot } from "./raw/RawSnapshot.js";

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
  build   [--from-raw=<path> | --competition=<code> --tm-api=<url>] [--season=] [--out=<dir>] [--emit-to=<dir>]
  enrich  --dataset=<dir> [--max=<n>] [--deep] [--retry-misses] [--missing-photos]
          [--no-names] [--tsdb-key=] [--tsdb-delay=<ms>] [--emit-to=<dir>] [--no-emit]
  ratings --dataset=<dir> --pes-key=<anon key> [--clubs=<id,id>] [--leagues=<id,id>]
          [--pes-url=] [--emit-to=<dir>] [--no-emit]`;

/**
 * Fold the cached enrichment layer (when there is one) into a snapshot. Pure:
 * an absent file simply means no enrichment, and the artifact is what it would
 * have been before this feature existed.
 */
/**
 * Load the cached ratings layer, if there is one. Absent simply means the
 * attributes stay inferred, exactly as before this source existed.
 */
function withRatings(datasetDir: string): { map?: ReturnType<typeof ratingsMapOf>; source?: SourceRef } {
  const file = loadPesFor(datasetDir);
  if (!file) return {};
  const map = ratingsMapOf(file);
  if (map.size === 0) return {};
  console.log(`  + ratings from ${file.source} (${map.size} players)`);
  return { map, source: { id: file.source, version: file.version, fetchedAt: "cached" } };
}

function withEnrichment(snapshot: RawSnapshot, datasetDir: string): { snapshot: RawSnapshot; source?: SourceRef } {
  const file = readEnrichment(enrichmentPath(datasetDir));
  if (!file) return { snapshot };
  const merged = mergeSources([snapshot, enrichmentToPartial(snapshot, file)]);
  const players = Object.values(file.players).filter((r) => r.status === "matched").length;
  console.log(`  + enrichment from ${file.source} (${players} players)`);
  return { snapshot: merged, source: { id: file.source, version: file.version, fetchedAt: "cached" } };
}

async function build(flags: Record<string, string>): Promise<void> {
  const out = flags.out ?? "./datasets";
  const now = new Date().toISOString();

  let snapshot: RawSnapshot;
  let sources: SourceRef[];
  /** Where an existing enrichment.json for this dataset would live. */
  let existingDir: string | undefined;

  if (flags["from-raw"]) {
    snapshot = loadRawSnapshot(flags["from-raw"]);
    sources = [{ id: "raw-file", version: "1", fetchedAt: now }];
    existingDir = dirname(flags["from-raw"]);
    console.log(`Recomputing from snapshot ${flags["from-raw"]} (no network).`);
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
  const enriched = withEnrichment(snapshot, existingDir ?? join(out, slug));
  if (enriched.source) sources = [...sources, enriched.source];

  // `snapshot` stays pristine and is what lands back in raw.json; only the
  // pipeline sees the enriched version.
  const ratings = withRatings(existingDir ?? join(out, slug));
  if (ratings.source) sources = [...sources, ratings.source];

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
    console.log(
      `  ratings: ${r.rated} real (mean ${r.ratedMean.toFixed(1)}, sd ${r.ratedSd.toFixed(2)}) · ` +
        `${r.backfilled} inferred, rescaled ×${r.backfillTransform.scale.toFixed(3)} ${r.backfillTransform.offset >= 0 ? "+" : "−"}${Math.abs(r.backfillTransform.offset).toFixed(1)}`,
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
 * Fetch PES-style ratings and resolve them onto our players.
 *
 * Writes ONLY `pes.json`. Never touches `raw.json` or `enrichment.json` — the
 * same rule the other two commands follow, so any layer can be rebuilt without
 * costing the others.
 */
async function ratings(flags: Record<string, string>): Promise<void> {
  const dir = flags.dataset;
  if (!dir) {
    console.error(`Missing --dataset=<dir>.
${USAGE}`);
    process.exit(1);
  }
  const key = flags["pes-key"] ?? process.env.PES_KEY;
  if (!key) {
    console.error("Missing --pes-key=<anon key> (or PES_KEY in the environment).");
    process.exit(1);
  }
  const now = new Date().toISOString();
  const snapshot = loadRawSnapshot(join(dir, ARTIFACT_FILES.raw));
  const src = new PesRetroSource(key, { baseUrl: flags["pes-url"], delayMs: Number(flags["pes-delay"] ?? 250) });

  const clubIds = (flags.clubs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const leagueIds = (flags.leagues ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (clubIds.length === 0 && leagueIds.length === 0) {
    console.error("Give either --clubs=<source club ids> or --leagues=<source league ids>.");
    process.exit(1);
  }
  console.log(`Fetching ratings from ${src.id} …`);
  const players = clubIds.length > 0
    ? await src.fetchClubPlayers(clubIds, (m) => console.log(m))
    : await src.fetchLeaguePlayers(leagueIds, (m) => console.log(m));
  console.log(`  ${players.length} source players
`);

  const store = new PesStore(pesPath(dir), src.id, src.version, loadPesFor(dir));
  const overrides = Object.fromEntries(
    (flags["club-map"] ?? "").split(",").map((pair) => pair.split(":")).filter((p) => p.length === 2).map(([a, b]) => [a!.trim(), b!.trim()]),
  );
  const outcome = resolveRatings(snapshot, players, store, now, { clubOverrides: overrides, log: (m) => console.log(m) });
  store.flush();

  console.log(`
✓ Wrote ${pesPath(dir)}`);
  console.log(`  clubs matched : ${outcome.clubsMatched}/${snapshot.clubs.length}`);
  for (const c of outcome.clubsMissed) console.log(`    ⚠ no club match: ${c}`);
  const total = snapshot.players.length;
  const pct = ((outcome.playersMatched / Math.max(1, total)) * 100).toFixed(0);
  console.log(`  players rated : ${outcome.playersMatched}/${total} (${pct}%)`);
  console.log(`  unrated       : ${outcome.playersMissed} — these keep inferred attributes, rescaled onto the rated population`);
  for (const a of outcome.ambiguous) console.log(`    ⚠ ambiguous, refused: ${a}`);

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
