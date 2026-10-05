import { expect, test } from "vitest";
import {
  computeSchemaFingerprint,
  convexDeployCliArgs,
  convexDeployRetryCliArgs,
  convexPostPushRunFunctions,
  describeConvexDeployPlan,
  isMergeQueueGitRef,
  planConvexDeploy,
  planPreviewName,
  previewNameFromGitRef,
  shouldPushConvexBackend,
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

test("plans production", () => {
  expect(
    planConvexDeploy({
      currentFingerprint: fingerprint,
      gitRef: "main",
      stored: { fingerprint: null, previewExists: false },
      vercelEnv: "production",
    }),
  ).toEqual({
    kind: "production",
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
      writeEnv: true,
    }),
  ).toBe("Production — deploying Convex and building the web app");
  expect(
    describeConvexDeployPlan({
      kind: "preview-create",
      previewName,
      writeEnv: true,
    }),
  ).toBe(`Preview is new — creating Convex preview "${previewName}" (no wipe)`);
  expect(
    describeConvexDeployPlan({
      kind: "preview-recreate",
      previewName,
      writeEnv: true,
    }),
  ).toBe(`Schema changed — recreating Convex preview "${previewName}"`);
  expect(
    describeConvexDeployPlan({
      kind: "preview-reuse",
      previewName,
      writeEnv: true,
    }),
  ).toBe(
    `Preview exists without a schema fingerprint — pushing functions to existing preview "${previewName}" (no wipe)`,
  );
  expect(
    describeConvexDeployPlan({
      kind: "preview-reuse",
      previewName,
      writeEnv: false,
    }),
  ).toBe(`Schema unchanged — pushing functions to existing preview "${previewName}" (no wipe)`);
});

test("deploy flags wipe only when recreating an existing preview", () => {
  expect(convexDeployCliArgs({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexDeployCliArgs({
      kind: "production",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexDeployCliArgs({
      kind: "preview-create",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    convexDeployCliArgs({
      kind: "preview-recreate",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["--preview-create", "feat/demo"]);
  expect(
    convexDeployCliArgs({
      kind: "preview-reuse",
      previewName: "feat/demo",
      writeEnv: false,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
});

test("start_push 408 retries claim the preview without a wipe", () => {
  expect(convexDeployRetryCliArgs({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexDeployRetryCliArgs({
      kind: "production",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-create",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-recreate",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
  expect(
    convexDeployRetryCliArgs({
      kind: "preview-reuse",
      previewName: "feat/demo",
      writeEnv: false,
    }),
  ).toEqual(["--preview-name", "feat/demo"]);
});

test("follow-up Convex CLI commands target the preview on preview plans", () => {
  expect(planPreviewName({ kind: "merge-queue-web-only" })).toBe(null);
  expect(planPreviewName({ kind: "production", writeEnv: true })).toBe(null);
  expect(
    planPreviewName({
      kind: "preview-create",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toBe("feat/demo");
  expect(
    planPreviewName({
      kind: "preview-recreate",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toBe("feat/demo");
  expect(
    planPreviewName({
      kind: "preview-reuse",
      previewName: "feat/demo",
      writeEnv: false,
    }),
  ).toBe("feat/demo");
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
    writeEnv: true,
  });
  expect(convexDeployCliArgs(firstDeploy)).toEqual(["--preview-name", branch]);

  const laterDeploy = planConvexDeploy({
    currentFingerprint: fingerprint,
    gitRef: branch,
    stored: { fingerprint, previewExists: true },
    vercelEnv: "preview",
  });
  expect(laterDeploy).toEqual({
    kind: "preview-reuse",
    previewName: branch,
    writeEnv: false,
  });
  expect(convexDeployCliArgs(laterDeploy)).toEqual(["--preview-name", branch]);
  expect(planPreviewName(laterDeploy)).toBe(branch);
});

test("create and recreate run seedDemoData after the push, which a 408 retry cannot skip", () => {
  expect(convexPostPushRunFunctions({ kind: "merge-queue-web-only" })).toEqual([]);
  expect(
    convexPostPushRunFunctions({
      kind: "production",
      writeEnv: true,
    }),
  ).toEqual([]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-create",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["seed:seedDemoData"]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-recreate",
      previewName: "feat/demo",
      writeEnv: true,
    }),
  ).toEqual(["seed:seedDemoData"]);
  expect(
    convexPostPushRunFunctions({
      kind: "preview-reuse",
      previewName: "feat/demo",
      writeEnv: false,
    }),
  ).toEqual([]);
});
