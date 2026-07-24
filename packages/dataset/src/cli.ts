/**
 * On-demand dataset assembler — a SEPARATE command the user runs to build a
 * personal dataset. Not part of the app build; not invoked at runtime.
 *
 *   npx tsx packages/dataset/src/cli.ts build --competition=BRA1 --season=2025 \
 *       --out=./datasets --tm-api=http://localhost:8000
 *   npx tsx packages/dataset/src/cli.ts build --from-raw=<raw.json> --out=./datasets
 *
 * `--from-raw` recomputes the artifact from an existing snapshot WITHOUT
 * refetching — the path to run after the inference formulas change.
 */
import { TransfermarktSource } from "./sources/TransfermarktSource.js";
import { mergeSources } from "./sources/mergeSources.js";
import { buildArtifact, loadRawSnapshot, writeArtifact } from "./artifact/store.js";
import type { SourceRef } from "./artifact/DatasetArtifact.js";
import type { RawSnapshot } from "./raw/RawSnapshot.js";

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
  const [cmd = "build", ...rest] = argv;
  const flags: Record<string, string> = {};
  for (const a of rest) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) flags[m[1]!] = m[2]!;
  }
  return { cmd, flags };
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (cmd !== "build") {
    console.error(`Unknown command "${cmd}". Usage: build [--from-raw=<path> | --competition=BRA1 --tm-api=<url>] --out=<dir>`);
    process.exit(1);
  }
  const out = flags.out ?? "./datasets";
  const now = new Date().toISOString();

  let snapshot: RawSnapshot;
  let sources: SourceRef[];
  if (flags["from-raw"]) {
    snapshot = loadRawSnapshot(flags["from-raw"]);
    sources = [{ id: "raw-file", version: "1", fetchedAt: now }];
    console.log(`Recomputing from snapshot ${flags["from-raw"]} (no network).`);
  } else {
    const competition = flags.competition;
    if (!competition) {
      console.error("Missing --competition=<code> (e.g. BRA1) or --from-raw=<path>.");
      process.exit(1);
    }
    const src = new TransfermarktSource(flags["tm-api"] ?? "http://localhost:8000", { delayMs: Number(flags.delay ?? 0) });
    console.log(`Fetching ${competition} from ${src.id} … (this may take a while)`);
    const part = await src.fetchCompetition(competition, flags.season);
    snapshot = mergeSources([part]);
    sources = [{ id: src.id, version: src.version, fetchedAt: now }];
  }

  const name = flags.name ?? snapshot.competitions.find((c) => c.id === snapshot.primaryCompetitionId)?.name ?? snapshot.primaryCompetitionId;
  const slug = flags.slug ?? slugify(name);
  const { artifact, report } = buildArtifact(snapshot, { name, slug, sources, datasetVersion: flags.version, note: flags.note });
  const dir = writeArtifact(out, artifact);

  const { manifest } = artifact;
  console.log(`\n✓ Wrote dataset "${manifest.name}" → ${dir}`);
  console.log(`  ${manifest.counts.clubs} clubs · ${manifest.counts.players} players · ${manifest.counts.competitions} competitions`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
  if (report.errors.length) {
    for (const e of report.errors) console.error(`  ✗ ${e}`);
    console.error(`\n${report.errors.length} validation error(s). Artifact written but not career-ready.`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
