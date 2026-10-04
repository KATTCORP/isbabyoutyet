import { matchesGlob } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Result } from "effect";
import { TestConsole } from "effect/testing";
import {
  compareCoverage,
  CoverageRegressedError,
  InvalidSummaryError,
  NoCurrentSummariesError,
} from "./coverageComparison";

function summary(pct: number) {
  return JSON.stringify({
    total: {
      branches: { pct },
      functions: { pct },
      lines: { pct },
      statements: { pct },
    },
  });
}

/** Runs `compareCoverage` on `base/` and `current/` without touching disk or `process.env`. */
function compare(options: { env: Record<string, string>; files: Record<string, string> }) {
  const files = new Map(Object.entries(options.files));
  const writes: Array<Parameters<FileSystem.FileSystem["writeFileString"]>> = [];

  const fileSystem = FileSystem.layerNoop({
    glob: (pattern, globOptions) =>
      Effect.sync(() => {
        const root = `${globOptions?.root ?? "."}/`;
        return [...files.keys()]
          .filter((file) => file.startsWith(root))
          .map((file) => file.slice(root.length))
          .filter((file) => matchesGlob(file, pattern));
      }),
    readFileString: (path) =>
      Option.match(Option.fromUndefinedOr(files.get(path)), {
        onNone: () => Effect.die(`Unexpected read of ${path}`),
        onSome: Effect.succeed,
      }),
    writeFileString: (...args) =>
      Effect.sync(() => {
        writes.push(args);
      }),
  });

  return Effect.gen(function* () {
    const result = yield* Effect.result(
      compareCoverage({ baselineDir: "base", currentDir: "current" }),
    );
    const logs = yield* TestConsole.logLines;
    return { logs, result, writes };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        fileSystem,
        Path.layer,
        ConfigProvider.layer(ConfigProvider.fromUnknown(options.env)),
      ),
    ),
  );
}

describe("compareCoverage", () => {
  it.effect("passes when every workspace stays within 0.3 points of its baseline", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: {},
        files: {
          "base/web/coverage-summary.json": summary(80),
          "current/new/coverage-summary.json": summary(10),
          "current/web/coverage-summary.json": summary(79.7),
        },
      });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      expect(run.logs).toStrictEqual([
        "::notice title=Coverage::Every workspace meets or exceeds its PR base baseline.",
      ]);
    }),
  );

  it.effect("fails with every metric that dropped more than 0.3 points", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: {},
        files: {
          "base/web/coverage-summary.json": summary(80),
          "current/web/coverage-summary.json": summary(79.6),
        },
      });

      const regressions = ["statements", "branches", "functions", "lines"].map(
        (metric) => `web ${metric}: 79.60% is below PR base's 80.00%`,
      );
      expect(run.result).toStrictEqual(Result.fail(new CoverageRegressedError({ regressions })));
      expect(run.logs).toStrictEqual([
        `::error title=Coverage regressed::${regressions.join("; ")}`,
      ]);
    }),
  );

  it.effect("skips the ratchet when the baseline has no per-workspace summaries", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: {},
        files: { "current/web/coverage-summary.json": summary(10) },
      });

      expect(run.result).toStrictEqual(Result.succeed(undefined));
      expect(run.logs).toStrictEqual([
        expect.stringMatching(/^::warning title=Coverage ratchet skipped::/),
      ]);
    }),
  );

  it.effect("fails when the current run has no summaries", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: {},
        files: { "base/web/coverage-summary.json": summary(80) },
      });

      expect(run.result).toStrictEqual(
        Result.fail(new NoCurrentSummariesError({ dir: "current" })),
      );
    }),
  );

  it.effect("names the summary that doesn't decode", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: {},
        files: { "current/web/coverage-summary.json": '{"total":{"lines":{"pct":"80"}}}' },
      });

      const error = Option.getOrThrow(Result.getFailure(run.result));
      expect(error).toBeInstanceOf(InvalidSummaryError);
      expect(error.message).toMatch(
        /^Invalid coverage summary: current\/web\/coverage-summary\.json\n/,
      );
    }),
  );

  it.effect("appends a markdown table to GITHUB_STEP_SUMMARY", () =>
    Effect.gen(function* () {
      const run = yield* compare({
        env: { GITHUB_STEP_SUMMARY: "/summary.md" },
        files: {
          "base/gone/coverage-summary.json": summary(80),
          "base/web/coverage-summary.json": summary(80),
          "current/new/coverage-summary.json": summary(10),
          "current/web/coverage-summary.json": summary(79.6),
        },
      });

      const cell = "79.60% (-0.40%) ❌";
      expect(run.writes).toStrictEqual([
        [
          "/summary.md",
          [
            "## Coverage vs PR base (per workspace)",
            "",
            "| Workspace | statements | branches | functions | lines |",
            "| --- | ---: | ---: | ---: | ---: |",
            "| `new` | 10.00% (new) | 10.00% (new) | 10.00% (new) | 10.00% (new) |",
            `| \`web\` | ${cell} | ${cell} | ${cell} | ${cell} |`,
            "",
            "In the baseline but not measured now:",
            "",
            "- `gone`",
            "",
          ].join("\n"),
          { flag: "a" },
        ],
      ]);
    }),
  );

  it.effect.each<Record<string, string>>([{}, { GITHUB_STEP_SUMMARY: "" }])(
    "skips the step summary when unset (%o)",
    (env) =>
      Effect.gen(function* () {
        const run = yield* compare({
          env,
          files: { "current/web/coverage-summary.json": summary(10) },
        });

        expect(run.writes).toStrictEqual([]);
      }),
  );
});
