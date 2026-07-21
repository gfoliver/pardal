import { defineConfig } from "vitest/config";

/**
 * Root Vitest config. Resolves the workspace packages by their public names so
 * tests can import `@fut/domain`, `@fut/engine`, etc. directly from source.
 */
export default defineConfig({
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
