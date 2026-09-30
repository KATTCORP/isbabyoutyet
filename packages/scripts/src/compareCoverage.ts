import { appendFile, glob, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JsonObject, JsonValue } from "@workspace/runtime/json";
import { isJsonObjectValue, parseJsonNumber } from "@workspace/runtime/json";

const metrics = ["statements", "branches", "functions", "lines"] as const;

type CoverageMetric = (typeof metrics)[number];
type CoverageSummary = { total: JsonObject };
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

const baselineDir = process.argv[2];
const currentDir = process.argv[3];

if (baselineDir === undefined || currentDir === undefined) {
  throw new Error(
    "Usage: compare-coverage <baseline-dir> <current-dir> (each holds <workspace>/coverage-summary.json)",
  );
}

const MAX_REGRESSION_PCT = 0.3;

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatChange(change: number) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

async function readSummary(path: string) {
  const contents = await readFile(path, "utf8");
  const summary: JsonValue = JSON.parse(contents);

  if (
    !isJsonObjectValue(summary) ||
    !("total" in summary) ||
    !isJsonObjectValue(summary["total"])
  ) {
    throw new Error(`Invalid coverage summary: ${path}`);
  }

  return { total: summary["total"] };
}

/** Workspace path (e.g. `projects/isbabyoutyet/web`) → summary. */
async function readSummaries(dir: string) {
  const summaries = new Map<string, CoverageSummary>();
  for await (const path of glob("**/coverage-summary.json", { cwd: dir })) {
    summaries.set(dirname(path), await readSummary(join(dir, path)));
  }
  return summaries;
}

function getPercentage(
  summary: CoverageSummary,
  options: { metric: CoverageMetric; path: string },
) {
  const metric = summary.total[options.metric];
  const percentage =
    metric !== undefined && isJsonObjectValue(metric) && "pct" in metric
      ? parseJsonNumber(metric["pct"])
      : null;

  if (percentage === null || !Number.isFinite(percentage)) {
    throw new Error(`Invalid ${options.metric} coverage percentage: ${options.path}`);
  }

  return percentage;
}

function isRegression(result: MetricResult) {
  return result.change !== null && result.change < -MAX_REGRESSION_PCT;
}

function formatCell(result: MetricResult) {
  const change = result.change === null ? "new" : formatChange(result.change);
  const marker = isRegression(result) ? " ❌" : "";
  return `${formatPct(result.current)} (${change})${marker}`;
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

const baseline = await readSummaries(baselineDir);
const current = await readSummaries(currentDir);

if (current.size === 0) {
  throw new Error(`No workspace coverage-summary.json under ${currentDir}`);
}

const results = [...current.keys()].toSorted().map((workspace) => {
  const currentSummary = current.get(workspace);
  const baselineSummary = baseline.get(workspace);
  if (currentSummary === undefined) {
    throw new Error(`Missing current summary for ${workspace}`);
  }

  return {
    metrics: metrics.map((metric) => {
      const currentPercentage = getPercentage(currentSummary, {
        metric,
        path: join(currentDir, workspace),
      });
      const baselinePercentage =
        baselineSummary === undefined
          ? null
          : getPercentage(baselineSummary, { metric, path: join(baselineDir, workspace) });

      return {
        baseline: baselinePercentage,
        change: baselinePercentage === null ? null : currentPercentage - baselinePercentage,
        current: currentPercentage,
        metric,
      };
    }),
    workspace,
  };
});
const missing = [...baseline.keys()].filter((workspace) => !current.has(workspace)).toSorted();

console.table(
  results.flatMap((result) =>
    result.metrics.map((metric) => ({
      workspace: result.workspace,
      ...metric,
      change: metric.change === null ? "new" : formatChange(metric.change),
    })),
  ),
);

const stepSummaryPath = process.env["GITHUB_STEP_SUMMARY"];
if (stepSummaryPath !== undefined && stepSummaryPath !== "") {
  await appendFile(stepSummaryPath, buildStepSummary({ missing, results }), "utf8");
}

if (!results.some((result) => baseline.has(result.workspace))) {
  console.log(
    "::warning title=Coverage ratchet skipped::The baseline has no per-workspace summaries (it predates per-workspace coverage). Nothing to compare against.",
  );
  process.exit(0);
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
  console.log(`::error title=Coverage regressed::${regressions.join("; ")}`);
  throw new Error(`Coverage regressed:\n- ${regressions.join("\n- ")}`);
}

console.log("::notice title=Coverage::Every workspace meets or exceeds its PR base baseline.");
