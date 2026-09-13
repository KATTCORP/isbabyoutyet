import { defineConfig } from "vitest/config";
import { webUnitProject } from "./products/baby-outlet/web/vitest.config.ts";

/**
 * Monorepo Vitest projects (formerly "workspaces").
 * Run all packages from the repo root with `pnpm test` / `pnpm exec vitest run`.
 */
const oxlintPluginsProject = {
  test: {
    name: "oxlint-plugins",
    include: ["oxlint-plugins/**/*.test.ts"],
    environment: "node" as const,
  },
};

export default defineConfig({
  test: {
    projects: [
      "products/baby-outlet/backend",
      "products/rhythm-game/web",
      "products/kitchenlab/web",
      "packages/query-prefetch",
      "packages/convex-prefetch",
      webUnitProject,
      oxlintPluginsProject,
    ],
    coverage: {
      provider: "v8",
      // In Vitest 4, listing patterns in `include` also pulls *untested*
      // files into the report, so uncovered code counts against the numbers
      // instead of silently hiding.
      include: [
        "products/baby-outlet/web/src/**/*.{ts,tsx}",
        "products/baby-outlet/backend/convex/**/*.ts",
        "products/baby-outlet/backend/src/**/*.ts",
        "products/rhythm-game/web/src/**/*.{ts,tsx}",
        "products/kitchenlab/web/src/**/*.{ts,tsx}",
        "packages/query-prefetch/src/**/*.ts",
        "packages/convex-prefetch/src/**/*.ts",
      ],
      exclude: [
        "**/_generated/**",
        "**/routeTree.gen.ts",
        "**/*.test.{ts,tsx}",
        "**/test.setup.ts",
        "**/test.resource.ts",
      ],
      reporter: ["text-summary", "html", "json", "json-summary"],
    },
  },
});
