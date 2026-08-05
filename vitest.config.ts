import { defineConfig } from "vitest/config";

/**
 * Root Vitest config. Resolves the workspace packages by their public names so
 * tests can import `@fut/domain`, `@fut/engine`, etc. directly from source.
 */
export default defineConfig({
  /*
   * Kept inside the repo, because the default landed in the system temp directory and the suite failed
   * there intermittently on Windows: `EBUSY: resource busy or locked` writing Vitest's own SSR transform
   * cache, with several workers racing for the same file. It does not surface as a failing test — the
   * affected FILES never run, so the totals silently drop (measured: 86 files/868 tests became 81/713)
   * and the run still reads as green apart from an "unhandled errors" note at the bottom.
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
