import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The @fut/* packages are consumed as TypeScript SOURCE and use NodeNext-style
 * `.js` import specifiers (e.g. `from "./Catalog.js"`). Vite/esbuild don't map
 * those to the sibling `.ts` file, so resolve relative `.js` imports to `.ts`
 * when the `.ts` exists. Only affects source that actually ships `.ts` files.
 */
function tsSourceResolver(): Plugin {
  return {
    name: "fut-ts-source-resolver",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
      const candidate = path.resolve(path.dirname(importer), `${source.slice(0, -3)}.ts`);
      return existsSync(candidate) ? candidate : null;
    },
  };
}

export default defineConfig({
  plugins: [tsSourceResolver(), react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    host: true,
    fs: { allow: [repoRoot] },
  },
  optimizeDeps: {
    exclude: ["@fut/domain", "@fut/engine", "@fut/spatial", "@fut/competition", "@fut/i18n"],
  },
  build: {
    // flag-icons ships a flag per country; inlining the small ones would bake
    // ~250 unused flags into the stylesheet. Keep them as files so the browser
    // fetches only the handful of nationalities a dataset actually contains.
    assetsInlineLimit: (filePath) => (filePath.includes("flag-icons") ? false : undefined),
    rollupOptions: {
      output: {
        /*
         * Matched by PATH, not by module id.
         *
         * The object form (`{ vendor: ["react", "react-dom"] }`) named only those two entry modules,
         * and React's actual code lives in sibling files — `react/cjs/react.production.min.js`,
         * `react-dom/client`, `scheduler` — which the default algorithm then placed with their
         * importers. The result built a 30-BYTE vendor chunk with all of React still inside the
         * 1.29 MB index chunk, which looks exactly like a working split until you read the sizes.
         *
         * `node_modules/react` is deliberately not a loose substring test: it requires `react`
         * directly after the slash, so the dozen `@radix-ui/react-*` packages are not swept in.
         */
        manualChunks(id) {
          // Named so its size is visible in the build output. It is reachable only through
          // `CareerMatch`, which is lazy, so naming it does not pull it into the entry.
          if (id.includes("packages/spatial/")) return "spatial";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "vendor";
          return undefined;
        },
      },
    },
  },
});
