/**
 * Runs the conformance trace on every runtime the game can reach and compares them.
 *
 *   npm run conformance
 *
 * This is the test that turns "the simulation is bit-exact across engines" from an
 * argument into a measurement. Node and Chromium are both V8, so agreement between
 * them proves little; the ones that carry the information are:
 *
 *   - Firefox  — SpiderMonkey, an independent implementation
 *   - WebKit   — JavaScriptCore, which delegates several Math functions to the
 *                PLATFORM libm, making it the likeliest to disagree
 *   - workerd  — the actual Cloudflare runtime the server will run on
 *
 * Exits non-zero on any divergence, so CI can gate on it. Takes a couple of minutes
 * (three full matches per runtime), which is why it is not part of `npm test`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser } from "@playwright/test";
import { Miniflare } from "miniflare";
import { conformanceTrace, diffTraces, type ConformanceTrace } from "../src/conformance.js";

const here = import.meta.dirname;
const bundlePath = join(here, "..", "test", "__bundle__", "conformance.global.js");
const goldenPath = join(here, "..", "test", "__golden__", "conformance.json");

let bundle: string;
try {
  bundle = readFileSync(bundlePath, "utf8");
} catch {
  console.error(`Bundle missing. Build it first:\n  npx tsx packages/spatial/scripts/buildConformanceBundle.ts`);
  process.exit(2);
}
const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as ConformanceTrace;
const params = {
  seeds: golden.seeds,
  sampleEvery: golden.sampleEvery,
  maxSteps: golden.maxSteps ?? null,
};

/** The trace as the bundle computes it, given params with a null maxSteps. */
const CALL = `globalThis.__futConformance.conformanceTrace({
  seeds: ${JSON.stringify(params.seeds)},
  sampleEvery: ${params.sampleEvery},
  maxSteps: ${params.maxSteps === null ? "Infinity" : params.maxSteps}
})`;

async function inBrowser(name: string, launch: () => Promise<Browser>): Promise<ConformanceTrace> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    return (await page.evaluate(`(() => ${CALL})()`)) as ConformanceTrace;
  } finally {
    await browser.close();
  }
}

async function inWorkerd(): Promise<ConformanceTrace> {
  // The bundle is an IIFE that assigns to globalThis, so prepending it to a module
  // worker is enough — no import wiring, and it is byte-identical to what the
  // browsers ran.
  const mf = new Miniflare({
    modules: true,
    compatibilityDate: "2026-01-01",
    script: `${bundle}\nexport default { async fetch() { return Response.json(${CALL}); } };`,
  });
  try {
    const res = await mf.dispatchFetch("http://conformance.local/");
    if (!res.ok) throw new Error(`workerd returned ${res.status}: ${await res.text()}`);
    return (await res.json()) as ConformanceTrace;
  } finally {
    await mf.dispose();
  }
}

const runners: ReadonlyArray<{ name: string; run: () => Promise<ConformanceTrace> }> = [
  { name: `node ${process.version} (V8)`, run: async () => conformanceTrace({ ...params, maxSteps: params.maxSteps ?? Infinity }) },
  { name: "chromium (V8)", run: () => inBrowser("chromium", () => chromium.launch()) },
  { name: "firefox (SpiderMonkey)", run: () => inBrowser("firefox", () => firefox.launch()) },
  { name: "webkit (JavaScriptCore)", run: () => inBrowser("webkit", () => webkit.launch()) },
  { name: "workerd (Cloudflare)", run: inWorkerd },
];

let failed = false;
console.log(`\nconformance: ${golden.seeds.length} full matches, ${golden.samples.length} samples, vs the committed golden\n`);

for (const { name, run } of runners) {
  const started = Date.now();
  let trace: ConformanceTrace;
  try {
    trace = await run();
  } catch (err) {
    failed = true;
    console.log(`  ${name.padEnd(26)} ERROR  ${(err as Error).message}`);
    continue;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const divergences = diffTraces(golden, trace);
  const finalsMatch = JSON.stringify(trace.finals) === JSON.stringify(golden.finals);
  if (divergences.length === 0 && finalsMatch) {
    console.log(`  ${name.padEnd(26)} ok     ${trace.finals.join(" ")}   ${secs}s`);
    continue;
  }
  failed = true;
  console.log(`  ${name.padEnd(26)} DIVERGED  ${trace.finals.join(" ")}   ${secs}s`);
  for (const d of divergences) {
    console.log(`      seed ${d.seed}: first differs at step ${d.step} — golden ${d.expected}, got ${d.actual}`);
  }
  if (!finalsMatch) console.log(`      finals: golden ${golden.finals.join(" ")}, got ${trace.finals.join(" ")}`);
}

console.log();
if (failed) {
  console.error("A runtime disagreed. The step reported above is where to read code —");
  console.error("not the scoreline, which is thousands of steps of divergence later.\n");
  process.exit(1);
}
console.log("Every runtime produced an identical simulation.\n");
