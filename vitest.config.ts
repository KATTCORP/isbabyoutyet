import { defineConfig } from "vitest/config";
import { webUnitProject } from "./projects/isbabyoutyet/web/vitest.config.ts";

/**
 * Monorepo Vitest projects (formerly "workspaces").
 * Run all packages from the repo root with `pnpm test` / `pnpm exec vitest run`.
 * Coverage is per workspace (`workspaceCoverage` in `vitest.coverage.ts`); run it
 * with `pnpm test:coverage` (Turbo).
 */
export default defineConfig({
  test: {
    // Vitest's default includes every `package.json`, so `--changed` reran the
    // whole monorepo whenever a script line moved. Dependency changes land in
    // the lockfile, which still forces a full run.
    forceRerunTriggers: ["**/pnpm-lock.yaml", "**/{vitest,vite}.config.*/**"],
    fsModuleCache: true,
    projects: [
      "projects/isbabyoutyet/backend",
      "projects/sous-vide-guide/web",
      "packages/runtime",
      "packages/scripts",
      "packages/oxlint-plugins",
      "packages/query-prefetch",
      "packages/convex-cli",
      "packages/convex-prefetch",
      "packages/form-guard",
      "projects/isbabyoutyet/email",
      webUnitProject,
    ],
  },
});
