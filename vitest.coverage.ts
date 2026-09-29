import type { CoverageOptions } from "vitest/node";

const REPO_ROOT = import.meta.dirname;

/**
 * Per-workspace coverage preset. Each workspace measures only its own source
 * (`include` is relative to that workspace), so Turbo can cache and ratchet
 * workspaces independently.
 */
export function workspaceCoverage(include: Array<string>) {
  return {
    provider: "v8",
    // In Vitest 4, listing patterns in `include` also pulls *untested*
    // files into the report, so uncovered code counts against the numbers
    // instead of silently hiding.
    include,
    exclude: [
      "**/_generated/**",
      "**/routeTree.gen.ts",
      "**/paraglide/**",
      "**/*.test.{ts,tsx}",
      "**/test.setup.ts",
      "**/test.resource.ts",
      // setupFiles / host-API test helper; same role as test.setup.ts.
      "**/stubJsdomWindow.ts",
    ],
    // CI: json-summary for the local coverage ratchet; lcov for Codecov history
    // uploads, with repo-relative paths so per-workspace reports merge.
    // Local: full HTML/JSON reports for browsing.
    reporter: process.env["CI"]
      ? ["text-summary", "json-summary", ["lcov", { projectRoot: REPO_ROOT }]]
      : ["text-summary", "html", "json", "json-summary"],
  } satisfies CoverageOptions;
}
