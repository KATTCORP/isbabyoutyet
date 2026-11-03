/**
 * Decides whether a Vercel deploy of one workspace can be skipped, from the
 * files changed since its last deploy and the pnpm workspace graph.
 *
 * Vercel runs the `ignoreCommand` before `pnpm install`, so this module may
 * only import Node built-ins and relative `.ts` files (run via type stripping).
 */
import { globSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { isPlainObject, isString } from "../../runtime/src/guards.ts";

export type WorkspacePackage = {
  /** Every package named in its dependency fields, workspace or not. */
  readonly dependencies: ReadonlyArray<string>;
  /** Repo-relative directory without a trailing slash. */
  readonly dir: string;
  readonly name: string;
};

export type BuildDecision =
  | { readonly files: ReadonlyArray<string>; readonly kind: "build"; readonly reason: string }
  | { readonly kind: "skip"; readonly reason: string };

/** Runs `git` with these arguments: trimmed stdout, or `null` when it fails. */
export type Git = (args: ReadonlyArray<string>) => string | null;

/** The `VERCEL_*` system env vars that pick the diff base. */
export type VercelDeploy = {
  /** `VERCEL_GIT_COMMIT_REF` */
  readonly branch: string | undefined;
  /** `VERCEL_ENV` */
  readonly environment: string | undefined;
  /** `VERCEL_GIT_PREVIOUS_SHA`: last successful deploy of this project and branch. */
  readonly previousSha: string | undefined;
};

export type DiffBase =
  | { readonly kind: "found"; readonly sha: string; readonly source: string }
  | { readonly kind: "unknown"; readonly reason: string };

/** Repo-root files that change what `pnpm install` or Turbo does for every project. */
const ROOT_BUILD_INPUTS = [
  ".npmrc",
  ".nvmrc",
  "package.json",
  "patches/**",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
];

/** Files inside a deployed workspace that never reach its build output. */
const NON_BUILD_FILES = [
  "**/*.{md,mdx}",
  "**/*.{test,spec}.*",
  "**/__snapshots__/**",
  "**/vitest.config.*",
  "**/.agents/**",
  "**/.claude/**",
  "**/.cursor/**",
  "**/.oxlintrc.json",
  "**/skills-lock.json",
];

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const PRODUCTION_BRANCH = "main";
const PRODUCTION_REF = `refs/remotes/origin/${PRODUCTION_BRANCH}`;
/** Vercel clones 10 commits deep. Deepen in steps before giving up and building. */
const FETCH_DEPTHS = [100, 1000];

/**
 * Reads the `packages:` block list from `pnpm-workspace.yaml`.
 * @internal
 */
export function parseWorkspaceGlobs(yaml: string) {
  const globs: Array<string> = [];
  let inPackages = false;
  for (const line of yaml.split("\n")) {
    if (/^packages:\s*$/u.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages || /^\s*(?:#.*)?$/u.test(line)) {
      continue;
    }
    const glob = /^\s+-\s+(["']?)(?<glob>[^"'#\s]+)\1\s*(?:#.*)?$/u.exec(line)?.groups?.glob;
    if (glob === undefined) {
      break;
    }
    globs.push(glob);
  }
  return globs;
}

/**
 * Reads a workspace `package.json`; `null` when it has no name.
 * @internal
 */
export function parseWorkspacePackage(opts: { dir: string; manifest: string }) {
  const value: unknown = JSON.parse(opts.manifest);
  if (!isPlainObject(value) || !isString(value.name)) {
    return null;
  }
  return {
    dependencies: DEPENDENCY_FIELDS.flatMap((field) => {
      const dependencies = value[field];
      return isPlainObject(dependencies) ? Object.keys(dependencies) : [];
    }),
    dir: opts.dir,
    name: value.name,
  } satisfies WorkspacePackage;
}

/** Every package matched by `pnpm-workspace.yaml` under `root`. */
export function readWorkspacePackages(root: string) {
  const globs = parseWorkspaceGlobs(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const excluded = globs.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1));
  const dirs = new Set(
    globs
      .filter((glob) => !glob.startsWith("!"))
      .flatMap((glob) => globSync(`${glob}/package.json`, { cwd: root }))
      .map((manifest) => dirname(manifest))
      .filter((dir) => !excluded.some((glob) => matchesGlob(dir, glob))),
  );
  return [...dirs].flatMap(
    (dir) =>
      parseWorkspacePackage({
        dir,
        manifest: readFileSync(join(root, dir, "package.json"), "utf8"),
      }) ?? [],
  );
}

function dependencyClosure(opts: {
  packages: ReadonlyArray<WorkspacePackage>;
  root: WorkspacePackage;
}) {
  const byName = new Map(opts.packages.map((pkg) => [pkg.name, pkg]));
  const closure = new Map([[opts.root.name, opts.root]]);
  const queue = [opts.root];
  for (const pkg of queue) {
    for (const name of pkg.dependencies) {
      const dependency = byName.get(name);
      if (dependency && !closure.has(name)) {
        closure.set(name, dependency);
        queue.push(dependency);
      }
    }
  }
  return [...closure.values()];
}

function matchesAny(file: string, globs: ReadonlyArray<string>) {
  return globs.some((glob) => matchesGlob(file, glob));
}

/**
 * Builds when a changed file is a root build input, or sits in the project or a
 * workspace it transitively depends on and is not docs, tests, or agent config.
 * Builds when unsure: unknown project or an empty diff (a redeploy).
 */
export function decideBuild(opts: {
  changedFiles: ReadonlyArray<string>;
  packages: ReadonlyArray<WorkspacePackage>;
  projectDir: string;
}): BuildDecision {
  const project = opts.packages.find((pkg) => pkg.dir === opts.projectDir);
  if (!project) {
    return {
      files: [],
      kind: "build",
      reason: `"${opts.projectDir}" is not a pnpm workspace package`,
    };
  }
  if (opts.changedFiles.length === 0) {
    return { files: [], kind: "build", reason: "no files changed, so this is a redeploy" };
  }
  const dirs = dependencyClosure({ packages: opts.packages, root: project }).map(
    (pkg) => `${pkg.dir}/`,
  );
  const files = opts.changedFiles.filter(
    (file) =>
      matchesAny(file, ROOT_BUILD_INPUTS) ||
      (dirs.some((dir) => file.startsWith(dir)) && !matchesAny(file, NON_BUILD_FILES)),
  );
  const changed = `${opts.changedFiles.length} changed file(s)`;
  return files.length > 0
    ? {
        files,
        kind: "build",
        reason: `${files.length} of ${changed} are build inputs of ${project.name}`,
      }
    : { kind: "skip", reason: `none of ${changed} are build inputs of ${project.name}` };
}

function isShallow(git: Git) {
  return git(["rev-parse", "--is-shallow-repository"]) === "true";
}

function hasCommit(opts: { git: Git; sha: string }) {
  const verify = ["cat-file", "-e", `${opts.sha}^{commit}`];
  if (opts.git(verify) !== null) {
    return true;
  }
  // `fetch --depth` would make a full clone shallow, so only deepen Vercel's clone.
  if (!isShallow(opts.git)) {
    return false;
  }
  opts.git(["fetch", "--no-tags", "--depth=1", "origin", opts.sha]);
  return opts.git(verify) !== null;
}

function mergeBaseWithProduction(git: Git) {
  const local = git(["merge-base", "HEAD", PRODUCTION_REF]);
  if (local) {
    return local;
  }
  const head = git(["rev-parse", "HEAD"]);
  if (!head || !isShallow(git)) {
    return null;
  }
  for (const depth of FETCH_DEPTHS) {
    git([
      "fetch",
      "--no-tags",
      `--depth=${depth}`,
      "origin",
      head,
      `+refs/heads/${PRODUCTION_BRANCH}:${PRODUCTION_REF}`,
    ]);
    const base = git(["merge-base", "HEAD", PRODUCTION_REF]);
    if (base) {
      return base;
    }
  }
  return null;
}

/**
 * Diffs against the last successful deploy of this branch when Vercel knows it,
 * else (a branch's first deploy) against its merge-base with `main`. Production
 * without a previous deploy has no safe base, so it builds.
 */
export function resolveDiffBase(opts: { deploy: VercelDeploy; git: Git }): DiffBase {
  const previousSha = opts.deploy.previousSha;
  if (previousSha) {
    return hasCommit({ git: opts.git, sha: previousSha })
      ? { kind: "found", sha: previousSha, source: "VERCEL_GIT_PREVIOUS_SHA" }
      : { kind: "unknown", reason: `previous deploy ${previousSha} is not fetchable` };
  }
  if (opts.deploy.environment === "production" || opts.deploy.branch === PRODUCTION_BRANCH) {
    return { kind: "unknown", reason: "production has no previous successful deploy" };
  }
  const sha = mergeBaseWithProduction(opts.git);
  return sha
    ? { kind: "found", sha, source: `merge-base with ${PRODUCTION_BRANCH}` }
    : { kind: "unknown", reason: `no merge-base with ${PRODUCTION_BRANCH}` };
}
