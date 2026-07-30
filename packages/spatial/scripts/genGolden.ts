/**
 * Regenerates the committed conformance golden.
 *
 *   npx tsx packages/spatial/scripts/genGolden.ts
 *
 * Run this ONLY when a change to match behaviour is intended. The golden failing is
 * the system working: it means stored replays produced by the old engine no longer
 * reproduce, which is precisely the event that has to bump the engine version.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { conformanceTrace } from "../src/conformance.js";

const trace = conformanceTrace();
const out = join(import.meta.dirname, "..", "test", "__golden__", "conformance.json");
writeFileSync(out, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
console.log(`wrote ${trace.samples.length} samples over ${trace.seeds.length} seeds to`);
console.log(`  ${out}`);
console.log(`finals: ${trace.finals.join("  ")}`);
