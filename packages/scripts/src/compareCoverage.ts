import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Schema,
  String,
} from "effect";
import { Argument, Command } from "effect/cli";

const metrics = ["statements", "branches", "functions", "lines"] as const;

const MAX_REGRESSION_PCT = 0.3;

const MetricSummary = Schema.Struct({ pct: Schema.Finite });

/** Istanbul `coverage-summary.json`. Per-file entries beside `total` are ignored. */
const CoverageSummary = Schema.Struct({
  total: Schema.Struct({
    branches: MetricSummary,
    functions: MetricSummary,
    lines: MetricSummary,
    statements: MetricSummary,
  }),
});

type CoverageMetric = (typeof metrics)[number];
type CoverageSummary = typeof CoverageSummary.Type;
type MetricResult = {
  baseline: number | null;
  change: number | null;
  current: number;
  metric: CoverageMetric;
};
type WorkspaceResult = {
  metrics: Array<MetricResult>;
  workspace: string;
};

class InvalidSummaryError extends Schema.TaggedError<InvalidSummaryError>()("InvalidSummaryError", {
  cause: Schema.Defect(),
  path: Schema.String,
}) {
  override get message() {
    return `Invalid coverage summary: ${this.path}\n${globalThis.String(this.cause)}`;
  }
}

class NoCurrentSummariesError extends Schema.TaggedError<NoCurrentSummariesError>()(
  "NoCurrentSummariesError",
  { dir: Schema.String },
) {
  override get message() {
    return `No workspace coverage-summary.json under ${this.dir}`;
  }
}

class CoverageRegressedError extends Schema.TaggedError<CoverageRegressedError>()(
  "CoverageRegressedError",
  { regressions: Schema.Array(Schema.String) },
) {
  override get message() {
    return `Coverage regressed:\n- ${this.regressions.join("\n- ")}`;
  }
}

const decodeSummary = Schema.decodeUnknownEffect(Schema.fromJsonString(CoverageSummary));

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatChange(change: number) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

function isRegression(result: MetricResult) {
  return result.change !== null && result.change < -MAX_REGRESSION_PCT;
}

function formatCell(result: MetricResult) {
  const change = result.change === null ? "new" : formatChange(result.change);
  const marker = isRegression(result) ? " ❌" : "";
  return `${formatPct(result.current)} (${change})${marker}`;
}

function compareWorkspace(
  workspace: string,
  summaries: { baseline: CoverageSummary | undefined; current: CoverageSummary },
) {
  return {
    metrics: metrics.map((metric) => {
      const current = summaries.current.total[metric].pct;
      const baseline = summaries.baseline?.total[metric].pct ?? null;
      return {
        baseline,
        change: baseline === null ? null : current - baseline,
        current,
        metric,
      };
    }),
    workspace,
  };
}

function buildStepSummary(options: { missing: Array<string>; results: Array<WorkspaceResult> }) {
  const rows = options.results.map(
    (result) =>
      `| \`${result.workspace}\` | ${result.metrics.map((metric) => formatCell(metric)).join(" | ")} |`,
  );
  const missing = options.missing.map((workspace) => `- \`${workspace}\``);

  return [
    "## Coverage vs PR base (per workspace)",
    "",
    `| Workspace | ${metrics.join(" | ")} |`,
    `| --- |${metrics.map(() => " ---: |").join("")}`,
    ...rows,
    "",
    ...(missing.length > 0 ? ["In the baseline but not measured now:", "", ...missing, ""] : []),
  ].join("\n");
}

const readSummary = Effect.fn("readSummary")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const contents = yield* fs.readFileString(path);
  return yield* decodeSummary(contents).pipe(
    Effect.mapError((cause) => new InvalidSummaryError({ cause, path })),
  );
});

/** Workspace path (e.g. `projects/isbabyoutyet/web`) → summary. */
const readSummaries = Effect.fn("readSummaries")(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = yield* fs.glob("**/coverage-summary.json", { root: dir });
  const entries = yield* Effect.forEach(
    files,
    (file) =>
      readSummary(path.join(dir, file)).pipe(
        Effect.map((summary) => [path.dirname(file), summary] as const),
      ),
    { concurrency: "unbounded" },
  );
  return new Map(entries);
});

const compareCoverage = Command.make(
  "compare-coverage",
  {
    baselineDir: Argument.String("baseline-dir").pipe(
      Argument.withDescription("PR base reports: <workspace>/coverage-summary.json"),
    ),
    currentDir: Argument.String("current-dir").pipe(
      Argument.withDescription("This run's reports: <workspace>/coverage-summary.json"),
    ),
  },
  Effect.fn(function* (args) {
    const [baseline, current] = yield* Effect.all(
      [readSummaries(args.baselineDir), readSummaries(args.currentDir)],
      { concurrency: 2 },
    );

    if (current.size === 0) {
      return yield* new NoCurrentSummariesError({ dir: args.currentDir });
    }

    const results = Arr.sortWith(current, ([workspace]) => workspace, Order.String).map(
      ([workspace, summary]) =>
        compareWorkspace(workspace, { baseline: baseline.get(workspace), current: summary }),
    );
    const missing = [...baseline.keys()].filter((workspace) => !current.has(workspace)).toSorted();

    yield* Console.table(
      results.flatMap((result) =>
        result.metrics.map((metric) => ({
          workspace: result.workspace,
          ...metric,
          change: metric.change === null ? "new" : formatChange(metric.change),
        })),
      ),
    );

    const stepSummaryPath = yield* Config.option(Config.String("GITHUB_STEP_SUMMARY")).pipe(
      Effect.map(Option.filter(String.isNonEmpty)),
    );
    if (Option.isSome(stepSummaryPath)) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(stepSummaryPath.value, buildStepSummary({ missing, results }), {
        flag: "a",
      });
    }

    if (!results.some((result) => baseline.has(result.workspace))) {
      yield* Console.log(
        "::warning title=Coverage ratchet skipped::The baseline has no per-workspace summaries (it predates per-workspace coverage). Nothing to compare against.",
      );
      return;
    }

    const regressions = results.flatMap((result) =>
      result.metrics
        .filter((metric) => isRegression(metric))
        .map(
          (metric) =>
            `${result.workspace} ${metric.metric}: ${formatPct(metric.current)} is below PR base's ${formatPct(metric.baseline ?? 0)}`,
        ),
    );

    if (regressions.length > 0) {
      yield* Console.log(`::error title=Coverage regressed::${regressions.join("; ")}`);
      return yield* new CoverageRegressedError({ regressions });
    }

    yield* Console.log(
      "::notice title=Coverage::Every workspace meets or exceeds its PR base baseline.",
    );
  }),
);

compareCoverage.pipe(
  Command.run({ version: "0.0.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
