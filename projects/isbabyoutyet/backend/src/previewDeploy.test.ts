import { expect, test } from "vitest";
import {
  computeSchemaFingerprint,
  CONVEX_DEPLOY_URL_CMD,
  convexDeployArgv,
  convexDeployCliArgs,
  convexDeployRetryCliArgs,
  convexPostPushRunFunctions,
  convexSeedNpmScripts,
  describeConvexDeployPlan,
  interpretEnvGetResult,
  isConvexPreviewWithoutFunctions,
  isConvexStartPushTimeout,
  isMergeQueueGitRef,
  parseEnvGetOutput,
  planConvexDeploy,
  previewNameCliArgs,
  previewNameFromGitRef,
  shouldPushConvexBackend,
  shouldSkipPreviewPhotoSeed,
} from "./previewDeploy";

const previewName = "cursor/merge-queue-convex-preview";
const mergeQueueRef = "gh-readonly-queue/main/pr-280-66b364b09c1da1f4416401a654b03c50af93f86e";
const fingerprint = "abc123";

test("fingerprint changes when schema contents change", () => {
  const before = computeSchemaFingerprint([
    { contents: "defineSchema({ babies: defineTable({}) })", path: "convex/schema.ts" },
  ]);
  const after = computeSchemaFingerprint([
    {
      contents: "defineSchema({ babies: defineTable({ name: v.string() }) })",
      path: "convex/schema.ts",
    },
  ]);
  expect(before).not.toBe(after);
});

test("fingerprint is stable for the same files", () => {
  const files = [
    { contents: "a", path: "convex/schema.ts" },
    { contents: "b", path: "convex/convex.config.ts" },
  ];
  expect(computeSchemaFingerprint(files)).toBe(computeSchemaFingerprint(files));
});

test("plans merge-queue as web-only", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: mergeQueueRef,
      stored: { fingerprint: null, previewExists: false },
      vercelEnv: "preview",
    }),
  ).toEqual({ kind: "merge-queue-web-only" });
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: mergeQueueRef,
      stored: { fingerprint, previewExists: true },
      vercelEnv: "preview",
    }),
  ).toEqual({ kind: "merge-queue-web-only" });
});

test("plans production with homepage seed", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: "main",
      stored: { fingerprint: null, previewExists: false },
      vercelEnv: "production",
    }),
  ).toEqual({
    kind: "production",
    seed: "seed:homepage",
    writeEnv: true,
  });
});

test("creates a missing preview without a wipe", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: previewName,
      stored: { fingerprint: null, previewExists: false },
      vercelEnv: "preview",
    }),
  ).toEqual({
    kind: "preview-create",
    previewName,
    seed: "seed:homepage:content",
    writeEnv: true,
  });
});

test("recreates only when the schema fingerprint changed", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: "new",
      gitRef: previewName,
      stored: { fingerprint: "old", previewExists: true },
      vercelEnv: "preview",
    }),
  ).toEqual({
    kind: "preview-recreate",
    previewName,
    seed: "seed:homepage:content",
    writeEnv: true,
  });
});

test("reuses an existing preview when the fingerprint is missing or matches", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: previewName,
      stored: { fingerprint: null, previewExists: true },
      vercelEnv: "preview",
    }),
  ).toEqual({
    kind: "preview-reuse",
    previewName,
    seed: null,
    writeEnv: true,
  });
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: previewName,
      stored: { fingerprint, previewExists: true },
      vercelEnv: "preview",
    }),
  ).toEqual({
    kind: "preview-reuse",
    previewName,
    seed: null,
    writeEnv: false,
  });
});

test("describes reuse as a function push without a wipe", () => {
  expect(describeConvexDeployPlan({ kind: "merge-queue-web-only" })).toBe(
    "GitHub merge queue — skipping Convex push, building web app only",
  );
  expect(
    describeConvexDeployPlan({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toBe("Production — deploying Convex and building the web app");
  expect(
    describeConvexDeployPlan({
      kind: "preview-create",
      previewName,
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toBe(`Preview is new — creating Convex preview "${previewName}" (no wipe)`);
  expect(
    describeConvexDeployPlan({
      kind: "preview-recreate",
      previewName,
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toBe(`Schema changed — recreating Convex preview "${previewName}"`);
  expect(
    describeConvexDeployPlan({
      kind: "preview-reuse",
      previewName,
      seed: null,
      writeEnv: true,
    }),
  ).toBe(
    `Preview exists without a schema fingerprint — pushing functions to existing preview "${previewName}" (no wipe)`,
  );
  expect(
    describeConvexDeployPlan({
      kind: "preview-reuse",
      previewName,
      seed: null,
      writeEnv: false,
    }),
  ).toBe(`Schema unchanged — pushing functions to existing preview "${previewName}" (no wipe)`);
});

test("deploy flags wipe only when recreating an existing preview", () => {
  expect(convexDeployCliArgs({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexDeployCliArgs({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexDeployCliArgs({
      kind: "preview-create",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo", "--preview-run", "seed:seedDemoData"]);
  expect(
    convexDeployCliArgs({
      kind: "preview-recreate",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-create", "feat/demo", "--preview-run", "seed:seedDemoData"]);
  expect(
    convexDeployCliArgs({
      kind: "preview-reuse",
      previewName: "feat/demo",
      seed: null,
      writeEnv: false,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
});

test("start_push 408 retries claim the preview without a wipe", () => {
  expect(convexDeployRetryCliArgs({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexDeployRetryCliArgs({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-create",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-recreate",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-reuse",
      previewName: "feat/demo",
      seed: null,
      writeEnv: false,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
});

test("follow-up Convex CLI commands get --preview-name on preview plans", () => {
  expect(previewNameCliArgs({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    previewNameCliArgs({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    previewNameCliArgs({
      kind: "preview-create",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    previewNameCliArgs({
      kind: "preview-recreate",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    previewNameCliArgs({
      kind: "preview-reuse",
      previewName: "feat/demo",
      seed: null,
      writeEnv: false,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
});

test("env get treats a missing variable as an existing preview", () => {
  expect(
    interpretEnvGetResult({
      ok: false,
      stderr:
        '✖ Environment variable "PREVIEW_SCHEMA_FINGERPRINT" not found (on preview deployment keen-herring-537)',
      stdout: "",
    }),
  ).toEqual({ fingerprint: null, previewExists: true });
  expect(
    interpretEnvGetResult({
      ok: false,
      stderr: "✖ Error: Preview deployment not found",
      stdout: "",
    }),
  ).toEqual({ fingerprint: null, previewExists: false });
  expect(
    interpretEnvGetResult({
      ok: true,
      stderr: "",
      stdout: "deadbeef\n",
    }),
  ).toEqual({ fingerprint: "deadbeef", previewExists: true });
});

test("preview name comes from a branch ref, not a commit SHA", () => {
  expect(previewNameFromGitRef("refs/heads/perf/skip-convex-preview-wipe")).toBe(
    "perf/skip-convex-preview-wipe",
  );
  expect(previewNameFromGitRef("feat/demo")).toBe("feat/demo");
  expect(previewNameFromGitRef("54c61db7fcd60a732df7573671eb7777ab6b1054")).toBe(null);
});

test("merge queue refs skip the Convex push", () => {
  expect(isMergeQueueGitRef(mergeQueueRef)).toBe(true);
  expect(isMergeQueueGitRef(`refs/heads/${mergeQueueRef}`)).toBe(true);
  expect(isMergeQueueGitRef("feat/demo")).toBe(false);
  expect(isMergeQueueGitRef("20e0607956751eeb3467f750ed8367eaa6a6338c")).toBe(false);
  expect(shouldPushConvexBackend(mergeQueueRef)).toBe(false);
  expect(shouldPushConvexBackend("feat/demo")).toBe(true);
  expect(shouldPushConvexBackend("20e0607956751eeb3467f750ed8367eaa6a6338c")).toBe(true);
});

test("feature-branch previews create without a wipe then reuse", () => {
  const branch = "cursor/skip-mq-seed-preview-7188";
  const firstDeploy = planConvexDeploy({
    currentFingerprint: fingerprint,
    gitRef: branch,
    stored: { fingerprint: null, previewExists: false },
    vercelEnv: "preview",
  });
  expect(firstDeploy).toEqual({
    kind: "preview-create",
    previewName: branch,
    seed: "seed:homepage:content",
    writeEnv: true,
  });
  expect(convexDeployCliArgs(firstDeploy)).toEqual([
    "--preview-name",
    branch,
    "--preview-run",
    "seed:seedDemoData",
  ]);

  const laterDeploy = planConvexDeploy({
    currentFingerprint: fingerprint,
    gitRef: branch,
    stored: { fingerprint, previewExists: true },
    vercelEnv: "preview",
  });
  expect(laterDeploy).toEqual({
    kind: "preview-reuse",
    previewName: branch,
    seed: null,
    writeEnv: false,
  });
  expect(convexDeployCliArgs(laterDeploy)).toEqual(["--preview-name", branch]);
  expect(previewNameCliArgs(laterDeploy)).toEqual(["--preview-name", branch]);
});

test("photo seed skips merge-queue github.ref even when deployment.ref is a SHA", () => {
  const mergeQueueGithubRef = `refs/heads/${mergeQueueRef}`;
  const deploymentSha = "20e0607956751eeb3467f750ed8367eaa6a6338c";
  expect(
    shouldSkipPreviewPhotoSeed({
      deploymentEnvironment: "Preview",
      deploymentRef: deploymentSha,
      githubRef: mergeQueueGithubRef,
      resolvedBranch: "cursor/react-compiler-lint-6a73",
    }),
  ).toBe(true);
  expect(
    shouldSkipPreviewPhotoSeed({
      deploymentEnvironment: "Preview",
      deploymentRef: deploymentSha,
      githubRef: mergeQueueGithubRef,
      resolvedBranch: null,
    }),
  ).toBe(true);
  expect(
    shouldSkipPreviewPhotoSeed({
      deploymentEnvironment: "Preview",
      deploymentRef: deploymentSha,
      githubRef: "refs/heads/cursor/skip-mq-seed-preview-7188",
      resolvedBranch: "cursor/skip-mq-seed-preview-7188",
    }),
  ).toBe(false);
});

test("env get parser uses the last non-empty line", () => {
  expect(parseEnvGetOutput("")).toBe(null);
  expect(parseEnvGetOutput("deadbeef\n")).toBe("deadbeef");
  expect(parseEnvGetOutput("log noise\n  abc123  \n")).toBe("abc123");
});

test("detects Convex start_push 408 timeouts", () => {
  expect(
    isConvexStartPushTimeout(
      "✖ Error fetching POST  https://small-bandicoot-574.convex.cloud/api/deploy2/start_push 408 Request Timeout",
    ),
  ).toBe(true);
  expect(
    isConvexStartPushTimeout(
      "✖ Error fetching POST  https://helpful-dotterel-790.convex.cloud/api/deploy2/start_push 500 Internal Server Error",
    ),
  ).toBe(false);
  expect(isConvexStartPushTimeout("✔ Deployed Convex functions")).toBe(false);
});

test("deploy argv uses a tiny --cmd so start_push is not blocked by the web build", () => {
  expect(
    convexDeployArgv(["--preview-name", "feat/demo", "--preview-run", "seed:seedDemoData"]),
  ).toEqual([
    "deploy",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
    "--cmd",
    CONVEX_DEPLOY_URL_CMD,
    "--preview-name",
    "feat/demo",
    "--preview-run",
    "seed:seedDemoData",
  ]);
  expect(
    convexDeployArgv(
      convexDeployRetryCliArgs({
        kind: "preview-create",
        previewName: "feat/demo",
        seed: "seed:homepage:content",
        writeEnv: true,
      }),
    ),
  ).toEqual([
    "deploy",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
    "--cmd",
    CONVEX_DEPLOY_URL_CMD,
    "--preview-name",
    "feat/demo",
  ]);
});

test("create and recreate run seedDemoData via convex run after push because retry skips --preview-run", () => {
  expect(convexPostPushRunFunctions({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexPostPushRunFunctions({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-create",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["seed:seedDemoData"]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-recreate",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["seed:seedDemoData"]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-reuse",
      previewName: "feat/demo",
      seed: null,
      writeEnv: false,
    }),
  ).toEqual([]);
  expect(
    convexSeedNpmScripts({
      kind: "preview-create",
      previewName: "feat/demo",
      seed: "seed:homepage:content",
      writeEnv: true,
    }),
  ).toEqual(["seed:homepage:content"]);
  expect(
    convexSeedNpmScripts({
      kind: "production",
      seed: "seed:homepage",
      writeEnv: true,
    }),
  ).toEqual(["seed:homepage"]);
  expect(convexSeedNpmScripts({ kind: "merge-queue-web-only" })).toEqual([]);
});

test("detects a Convex preview with no functions after a skipped or timed-out push", () => {
  expect(
    isConvexPreviewWithoutFunctions(
      '✖ Failed to run function "homepageDemo:hasCompletePhotoSet":\n' +
        "Error: [Request ID: b414834fe9049b96] Server Error\n" +
        "Could not find function for 'homepageDemo:hasCompletePhotoSet'. Did you forget to run `npx convex dev`?\n" +
        "\n" +
        "No functions found.\n",
    ),
  ).toBe(true);
  expect(isConvexPreviewWithoutFunctions("✖ Error: Preview deployment not found")).toBe(true);
  expect(
    isConvexPreviewWithoutFunctions(
      "Could not find function for 'homepageDemo:hasCompletePhotoSet'. Did you forget to run `npx convex dev`?",
    ),
  ).toBe(false);
});
