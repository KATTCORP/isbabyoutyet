import { expect, test } from "vitest";
import { describeConvexDeployPlan, planConvexDeploy } from "./previewDeploy";

const mergeQueueRef = "gh-readonly-queue/main/pr-280-66b364b09c1da1f4416401a654b03c50af93f86e";

test("production deploys the production backend", () => {
  expect(planConvexDeploy({ gitRef: "main", vercelEnv: "production" })).toEqual({
    kind: "production",
  });
});

test("merge-queue previews only build the web app, with or without refs/heads/", () => {
  for (const gitRef of [mergeQueueRef, `refs/heads/${mergeQueueRef}`]) {
    expect(planConvexDeploy({ gitRef, vercelEnv: "preview" })).toEqual({ kind: "merge-queue" });
  }
});

test("every other preview targets the branch's preview backend", () => {
  expect(planConvexDeploy({ gitRef: "feat/demo", vercelEnv: "preview" })).toEqual({
    kind: "preview",
    previewName: "feat/demo",
  });
  expect(planConvexDeploy({ gitRef: "refs/heads/feat/demo", vercelEnv: "preview" })).toEqual({
    kind: "preview",
    previewName: "feat/demo",
  });
});

test("describes each plan for the build log", () => {
  expect(describeConvexDeployPlan({ kind: "merge-queue" })).toBe(
    "GitHub merge queue — skipping Convex push, building web app only",
  );
  expect(describeConvexDeployPlan({ kind: "production" })).toBe(
    "Production — deploying Convex and building the web app",
  );
  expect(describeConvexDeployPlan({ kind: "preview", previewName: "feat/demo" })).toBe(
    'Preview — deploying to Convex preview "feat/demo" (created if missing)',
  );
});
