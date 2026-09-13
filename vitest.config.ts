import { defineConfig } from "vitest/config";
import { webUnitProject } from "./projects/baby-outlet/web/vitest.config.ts";

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
      "projects/baby-outlet/backend",
      "projects/sous-vide-guide/web",
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
        "projects/baby-outlet/web/src/**/*.{ts,tsx}",
        "projects/baby-outlet/backend/convex/**/*.ts",
        "projects/baby-outlet/backend/src/**/*.ts",
        "projects/sous-vide-guide/web/src/**/*.{ts,tsx}",
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
