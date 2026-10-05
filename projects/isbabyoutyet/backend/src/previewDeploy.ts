/** Baked into merge-queue Vercel builds so Vite has a Convex URL without a push. */
export const MERGE_QUEUE_PLACEHOLDER_CONVEX_URL = "https://merge-queue.invalid.convex.cloud";

const HEADS_PREFIX = "refs/heads/";
const MERGE_QUEUE_REF = /^gh-readonly-queue\/.+\/pr-\d+-[0-9a-f]+$/i;

export type ConvexDeployPlan =
  | { kind: "merge-queue" }
  | { kind: "production" }
  | { kind: "preview"; previewName: string };

function gitBranchFromRef(ref: string) {
  return ref.startsWith(HEADS_PREFIX) ? ref.slice(HEADS_PREFIX.length) : ref;
}

/** GitHub merge-queue refs are unique per attempt (`…/pr-280-<sha>`). */
function isMergeQueueGitRef(ref: string) {
  return MERGE_QUEUE_REF.test(gitBranchFromRef(ref));
}

/**
 * Merge-queue checks only need the web build: a queue-specific backend would
 * be created and thrown away. Every other preview gets the branch's backend.
 */
export function planConvexDeploy(opts: {
  gitRef: string;
  vercelEnv: "production" | "preview";
}): ConvexDeployPlan {
  if (opts.vercelEnv === "production") {
    return { kind: "production" };
  }
  if (isMergeQueueGitRef(opts.gitRef)) {
    return { kind: "merge-queue" };
  }
  return { kind: "preview", previewName: gitBranchFromRef(opts.gitRef) };
}

export function describeConvexDeployPlan(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue":
      return "GitHub merge queue — skipping Convex push, building web app only";
    case "production":
      return "Production — deploying Convex and building the web app";
    case "preview":
      return `Preview — deploying to Convex preview "${plan.previewName}" (created if missing)`;
  }
}
