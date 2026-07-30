/**
 * Bundles the conformance trace into one self-contained script, so the SAME code
 * that CI runs on Node can be handed to a browser page or a workerd isolate.
 *
 *   npx tsx packages/spatial/scripts/buildConformanceBundle.ts
 *
 * esbuild comes in via Vite (already a dependency of @fut/web), so this adds nothing.
 * The output is build output — not committed.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const outDir = join(here, "..", "test", "__bundle__");
mkdirSync(outDir, { recursive: true });

// A tiny entry that hangs the two functions off the global object. Deliberately not
// an ES module export: the browser runner injects this with addScriptTag and the
// Worker runner concatenates it, and a global is the one interface both can reach.
const entry = join(outDir, "entry.ts");
writeFileSync(
  entry,
  [
    `import { conformanceTrace } from "../../src/conformance.js";`,
    `(globalThis as unknown as { __futConformance: unknown }).__futConformance = { conformanceTrace };`,
    ``,
  ].join("\n"),
  "utf8",
);

const out = join(outDir, "conformance.global.js");
await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: "iife",
  platform: "neutral",
  target: "es2022",
  // Keep it readable: if a runtime disagrees, the bundle is what gets bisected.
  minify: false,
  // `.js` specifiers resolving to `.ts` sources is this repo's convention (see the
  // Vite tsSourceResolver plugin); esbuild needs the same nudge.
  resolveExtensions: [".ts", ".js"],
  plugins: [
    {
      name: "ts-source-resolver",
      setup(b) {
        b.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
          const resolved = join(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
          return { path: resolved };
        });
      },
    },
  ],
});

console.log(`bundled -> ${out}`);
