import { createHash } from "node:crypto";

/** Stored on each Convex preview so later Vercel builds can skip `--preview-create`. */
export const SCHEMA_FINGERPRINT_ENV = "PREVIEW_SCHEMA_FINGERPRINT";

/**
 * Files that define the Convex data shape. Function-only changes must not
 * appear here — otherwise every preview deploy would wipe the database.
 */
export const SCHEMA_FINGERPRINT_RELATIVE_PATHS = [
  "convex/schema.ts",
  "convex/convex.config.ts",
] as const;

/** Baked into merge-queue Vercel builds so Vite has a Convex URL without a push. */
export const MERGE_QUEUE_PLACEHOLDER_CONVEX_URL = "https://merge-queue.invalid.convex.cloud";

const HEADS_PREFIX = "refs/heads/";
const MERGE_QUEUE_REF = /^gh-readonly-queue\/.+\/pr-\d+-[0-9a-f]+$/i;

export type ConvexDeployPlan =
  | { kind: "merge-queue-web-only" }
  | { kind: "production"; writeEnv: true }
  | {
      kind: "preview-create";
      previewName: string;
      writeEnv: true;
    }
  | {
      kind: "preview-recreate";
      previewName: string;
      writeEnv: true;
    }
  | {
      kind: "preview-reuse";
      previewName: string;
      writeEnv: boolean;
    };

export function computeSchemaFingerprint(files: ReadonlyArray<{ contents: string; path: string }>) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function gitBranchFromRef(ref: string) {
  if (ref.startsWith(HEADS_PREFIX)) {
    return ref.slice(HEADS_PREFIX.length);
  }
  return ref;
}

/** GitHub merge-queue refs are unique per attempt (`…/pr-280-<sha>`). */
export function isMergeQueueGitRef(ref: string) {
  return MERGE_QUEUE_REF.test(gitBranchFromRef(ref));
}

/** Merge-queue Vercel checks only need a web build — do not push or wipe a backend. */
export function shouldPushConvexBackend(gitRef: string) {
  return !isMergeQueueGitRef(gitRef);
}

/** Vercel GitHub deployments set `ref` to a SHA, not `refs/heads/<branch>`. */
export function previewNameFromGitRef(ref: string) {
  const branch = gitBranchFromRef(ref);
  if (/^[0-9a-f]{7,40}$/i.test(branch)) {
    return null;
  }
  return branch;
}

function shouldWipePreview(opts: {
  currentFingerprint: string;
  previewExists: boolean;
  storedFingerprint: string | null;
}) {
  if (!opts.previewExists) {
    return false;
  }
  if (opts.storedFingerprint === null) {
    return false;
  }
  return opts.storedFingerprint !== opts.currentFingerprint;
}

export function planConvexDeploy(opts: {
  currentFingerprint: string;
  gitRef: string;
  stored: { fingerprint: string | null; previewExists: boolean };
  vercelEnv: "production" | "preview";
}): ConvexDeployPlan {
  if (opts.vercelEnv === "preview" && isMergeQueueGitRef(opts.gitRef)) {
    return { kind: "merge-queue-web-only" };
  }
  if (opts.vercelEnv === "production") {
    return { kind: "production", writeEnv: true };
  }
  const previewName = previewNameFromGitRef(opts.gitRef) ?? opts.gitRef;
  if (!opts.stored.previewExists) {
    return {
      kind: "preview-create",
      previewName,
      writeEnv: true,
    };
  }
  if (
    shouldWipePreview({
      currentFingerprint: opts.currentFingerprint,
      previewExists: opts.stored.previewExists,
      storedFingerprint: opts.stored.fingerprint,
    })
  ) {
    return {
      kind: "preview-recreate",
      previewName,
      writeEnv: true,
    };
  }
  return {
    kind: "preview-reuse",
    previewName,
    writeEnv: opts.stored.fingerprint === null,
  };
}

export function describeConvexDeployPlan(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue-web-only":
      return "GitHub merge queue — skipping Convex push, building web app only";
    case "production":
      return "Production — deploying Convex and building the web app";
    case "preview-create":
      return `Preview is new — creating Convex preview "${plan.previewName}" (no wipe)`;
    case "preview-recreate":
      return `Schema changed — recreating Convex preview "${plan.previewName}"`;
    case "preview-reuse":
      if (plan.writeEnv) {
        return `Preview exists without a schema fingerprint — pushing functions to existing preview "${plan.previewName}" (no wipe)`;
      }
      return `Schema unchanged — pushing functions to existing preview "${plan.previewName}" (no wipe)`;
  }
}

export function convexDeployCliArgs(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue-web-only":
    case "production":
      return [];
    case "preview-recreate":
      return ["--preview-create", plan.previewName];
    case "preview-create":
    case "preview-reuse":
      return ["--preview-name", plan.previewName];
  }
}

/** After a start_push 408 the preview is already claimed — retry without a wipe. */
export function convexDeployRetryCliArgs(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue-web-only":
    case "production":
      return [];
    case "preview-create":
    case "preview-recreate":
    case "preview-reuse":
      return ["--preview-name", plan.previewName];
  }
}

/**
 * Run after the push rather than as `--preview-run`, which Convex skips when
 * a 408 retry reuses the just-claimed preview.
 */
export function convexPostPushRunFunctions(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue-web-only":
    case "preview-reuse":
    case "production":
      return [];
    case "preview-create":
    case "preview-recreate":
      return ["seed:seedDemoData"];
  }
}

/** The preview that `env`, `run`, and the seeds target after the push. */
export function planPreviewName(plan: ConvexDeployPlan) {
  switch (plan.kind) {
    case "merge-queue-web-only":
    case "production":
      return null;
    case "preview-create":
    case "preview-recreate":
    case "preview-reuse":
      return plan.previewName;
  }
}
