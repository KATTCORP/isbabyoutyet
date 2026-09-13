import { defineConfig } from "vitest/config";
import { webUnitProject } from "./apps/web/vitest.config.ts";

/**
 * Monorepo Vitest projects (formerly "workspaces").
 * Run all packages from the repo root with `pnpm test` / `pnpm exec vitest run`.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // In Vitest 4, listing patterns in `include` also pulls *untested*
      // files into the report, so uncovered code counts against the numbers
      // instead of silently hiding.
      exclude: [
        "**/_generated/**",
        "**/routeTree.gen.ts",
        "**/*.test.{ts,tsx}",
        "**/test.setup.ts",
        "**/test.resource.ts",
        // setupFiles / host-API test helper; same role as test.setup.ts.
        "**/stubJsdomWindow.ts",
        "**/testFetch.ts",
      ],
      include: [
        "apps/web/src/**/*.{ts,tsx}",
        "packages/convex/convex/**/*.ts",
        "packages/convex/src/**/*.ts",
        "packages/runtime/src/**/*.ts",
        "packages/query-prefetch/src/**/*.ts",
        "packages/convex-prefetch/src/**/*.ts",
        "packages/form-guard/src/**/*.ts",
        "packages/email/src/**/*.{ts,tsx}",
      ],
      // CI: json-summary for the local coverage ratchet; lcov for Codecov history uploads.
      // Local: full HTML/JSON reports for browsing.
      reporter: process.env.CI
        ? ["text-summary", "json-summary", "lcov"]
        : ["text-summary", "html", "json", "json-summary"],
    },
    experimental: {
      fsModuleCache: true,
      fsModuleCachePath: "node_modules/.experimental-vitest-cache",
    },
    projects: [
      "packages/convex",
      "packages/runtime",
      "packages/oxlint-plugins",
      "packages/query-prefetch",
      "packages/convex-prefetch",
      "packages/form-guard",
      "packages/email",
      webUnitProject,
    ],
  },
});
