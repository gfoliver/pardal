import { defineConfig } from "vitest/config";

/**
 * Root Vitest config. Resolves the workspace packages by their public names so
 * tests can import `@fut/domain`, `@fut/engine`, etc. directly from source.
 */
export default defineConfig({
  /*
   * Vitest's cache, kept inside the repo rather than in the system temp directory. Hygiene only.
   *
   * It does NOT fix the intermittent Windows `EBUSY: resource busy or locked` this was first added
   * for — I checked, and that write is `project.tmpDir` in `resolveConfig`, a per-run `mkdtemp`
   * directory this option does not govern. Vitest spills each transformed module to a file there for
   * the workers to import, and on Windows a rewrite can collide with a worker still reading it.
   *
   * What matters is that such a run FAILS: `checkUnhandledErrors` sets `process.exitCode = 1` when
   * anything unhandled is caught (`dangerouslyIgnoreUnhandledErrors` defaults to false). So the
   * damage — some test FILES never run, and the totals drop while every assertion that did run still
   * passes — is visible in the exit code even though the printed summary says "N passed". Trust the
   * exit code, never the summary line.
   */
  cacheDir: "node_modules/.vitest",
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@fut/domain": new URL("./packages/domain/src/index.ts", import.meta.url)
        .pathname,
      "@fut/engine": new URL("./packages/engine/src/index.ts", import.meta.url)
        .pathname,
      "@fut/spatial": new URL("./packages/spatial/src/index.ts", import.meta.url)
        .pathname,
      "@fut/i18n": new URL("./packages/i18n/src/index.ts", import.meta.url)
        .pathname,
      "@fut/competition": new URL(
        "./packages/competition/src/index.ts",
        import.meta.url,
      ).pathname,
      "@fut/app-cli": new URL("./packages/app-cli/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
