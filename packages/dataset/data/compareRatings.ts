/**
 * Authoring-time measurement: how many of a dataset's players a given FMInside dump actually resolves.
 *
 *   npx tsx packages/dataset/data/compareRatings.ts --dataset=<dir> <dump.json> [<dump.json> …]
 *
 * Read-only — it builds a `RatingsStore` but never flushes it, so nothing on disk changes. Exists
 * because "the new dump has more entries" is not the question. The question is how many of OUR players
 * the resolver can pair, and a bigger dump of the wrong clubs answers it worse than a smaller one of
 * the right ones. Run this before replacing a dump that works.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import { resolveScrapedRatings, type ScrapedPlayer } from "../src/ratings/resolve.js";
import { RatingsStore } from "../src/ratings/store.js";

function parseArgs(argv: readonly string[]): { dataset: string; dumps: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]!] = m[2] ?? "true";
    else rest.push(a);
  }
  if (!flags.dataset) throw new Error("Missing --dataset=<dir>");
  if (rest.length === 0) throw new Error("Give at least one dump path");
  return { dataset: flags.dataset, dumps: rest };
}

const { dataset, dumps } = parseArgs(process.argv.slice(2));
const snapshot: RawSnapshot = JSON.parse(readFileSync(resolve(dataset, "raw.json"), "utf8"));
const total = snapshot.players.length;
console.log(`${dataset}: ${snapshot.clubs.length} clubs · ${total} players\n`);

const pct = (n: number) => `${((n / Math.max(1, total)) * 100).toFixed(1)}%`;

for (const path of dumps) {
  const dump: ScrapedPlayer[] = JSON.parse(readFileSync(path, "utf8"));
  // A path that is never flushed; the store is only here because the resolver writes through one.
  const store = new RatingsStore("(not written)", "compare", "0");
  const out = resolveScrapedRatings(snapshot, dump, store);
  console.log(`${basename(path)}  (${dump.length} entries)`);
  console.log(`  matched        ${String(out.matched).padStart(4)}  ${pct(out.matched)}`);
  console.log(`  by club+name   ${String(out.byClubName).padStart(4)}`);
  console.log(`  by unique name ${String(out.byUniqueName).padStart(4)}   (the "he transferred" path)`);
  console.log(`  by name+age    ${String(out.byNameAndAge).padStart(4)}   (a shared name, split by age)`);
  console.log(`  not in dump    ${String(out.notInDump).padStart(4)}`);
  console.log(`  incomplete     ${String(out.incomplete).padStart(4)}   (found, but missing labels its position needs)\n`);
}
