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
    exclude: ["@fut/domain", "@fut/engine", "@fut/competition", "@fut/i18n"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
});
