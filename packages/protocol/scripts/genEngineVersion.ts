/**
 * Regenerates the committed engine version.
 *
 *   npm run engine:version
 *
 * Run this whenever the simulation packages change. The test will tell you when that
 * is: it recomputes the hash and fails if the committed constant no longer matches.
 *
 * A failing version test is the system working. It means match records written by the
 * old build no longer reproduce — which is the event a league's engine pin exists to
 * survive, and the reason confirmed scores are stored rather than re-derived.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeEngineVersion, SIMULATION_PACKAGES } from "./computeEngineVersion.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const { version, files } = await computeEngineVersion(repoRoot);

const out = join(import.meta.dirname, "..", "src", "engineVersion.ts");
writeFileSync(
  out,
  `/**
 * The exact simulation build, as a content hash of ${SIMULATION_PACKAGES.map((p) => `@fut/${p}`).join(", ")}.
 *
 * GENERATED — do not edit. Run \`npm run engine:version\` after changing the
 * simulation, and see \`scripts/computeEngineVersion.ts\` for what is hashed and why
 * humans do not get to set this by hand.
 */
export const ENGINE_VERSION = "${version}";
`,
  "utf8",
);

console.log(`engine version ${version} (${files} source files)`);
console.log(`  wrote ${out}`);
