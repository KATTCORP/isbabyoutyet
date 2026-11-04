/**
 * Decides whether a Vercel deploy of one workspace can be skipped, from the
 * files changed since its last deploy and the pnpm workspace graph.
 *
 * Node runs this file with type stripping (no build step), so relative imports
 * keep their `.ts` extension and the syntax must stay erasable.
 */
import { matchesGlob } from "node:path";
import {
  Cause,
  Config,
  Console,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** @internal Exported for tests. */
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

/** Vercel cancels the deploy on exit 0 and builds on anything else. */
export const SKIP = 0;
export const BUILD = 1;

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
] as const;

const PRODUCTION_BRANCH = "main";
const PRODUCTION_REF = `refs/remotes/origin/${PRODUCTION_BRANCH}`;
/** Vercel clones 10 commits deep. Deepen in steps before giving up and building. */
const FETCH_DEPTHS = [100, 1000];
const MAX_LISTED_FILES = 20;

export class GitError extends Schema.TaggedError<GitError>()("GitError", {
  args: Schema.Array(Schema.String),
  reason: Schema.String,
}) {
  override get message() {
    return `git ${this.args.join(" ")} failed: ${this.reason}`;
  }
}

/** @internal Exported for tests. */
export class NoDiffBaseError extends Schema.TaggedError<NoDiffBaseError>()("NoDiffBaseError", {
  reason: Schema.String,
}) {
  override get message() {
    return `no diff base: ${this.reason}`;
  }
}

/** @internal Exported for tests. */
export class InvalidManifestError extends Schema.TaggedError<InvalidManifestError>()(
  "InvalidManifestError",
  { cause: Schema.Defect(), dir: Schema.String },
) {
  override get message() {
    return `${this.dir}/package.json is not a valid manifest: ${globalThis.String(this.cause)}`;
  }
}

export class Git extends Context.Service<
  Git,
  {
    /** Trimmed stdout; fails when git cannot start or exits non-zero. */
    run(args: ReadonlyArray<string>): Effect.Effect<string, GitError>;
  }
>()("@workspace/scripts/vercelIgnore/Git") {
  static readonly layer = Layer.effect(
    Git,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const run = Effect.fn("Git.run")(
        function* (args: ReadonlyArray<string>) {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", args, {
              // A fetch that needs credentials must fail (and build), not wait on a prompt.
              env: { GIT_TERMINAL_PROMPT: "0" },
              extendEnv: true,
              // Probes such as `cat-file -e` fail by design; only fetch errors help in the log.
              stderr: args[0] === "fetch" ? "inherit" : "ignore",
              stdin: "ignore",
            }),
          );
          const [stdout, exitCode] = yield* Effect.all(
            [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
            { concurrency: 2 },
          );
          if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
            return yield* new GitError({ args, reason: `exit code ${exitCode}` });
          }
          return stdout.trim();
        },
        Effect.scoped,
        (effect, args) =>
          Effect.catchTag(effect, "PlatformError", (error) =>
            Effect.fail(new GitError({ args, reason: error.message })),
          ),
      );
      return Git.of({ run });
    }),
  );
}

function optionalEnv(name: string) {
  return Config.option(Config.String(name)).pipe(
    Config.map(Option.filter((value) => value !== "")),
  );
}

/** The `VERCEL_*` system env vars that pick the diff base. Empty counts as unset. */
const VercelDeploy = Config.all({
  branch: optionalEnv("VERCEL_GIT_COMMIT_REF"),
  environment: optionalEnv("VERCEL_ENV"),
  /** Last successful deploy of this project and branch. */
  previousSha: optionalEnv("VERCEL_GIT_PREVIOUS_SHA"),
  provider: optionalEnv("VERCEL_GIT_PROVIDER"),
  repoOwner: optionalEnv("VERCEL_GIT_REPO_OWNER"),
  repoSlug: optionalEnv("VERCEL_GIT_REPO_SLUG"),
});

/** @internal Exported for tests. */
export type VercelDeploy = Config.Success<typeof VercelDeploy>;

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

const DependencyMap = Schema.optional(Schema.Record(Schema.String, Schema.Unknown));
const Manifest = Schema.Struct({
  dependencies: DependencyMap,
  devDependencies: DependencyMap,
  name: Schema.optional(Schema.String),
  optionalDependencies: DependencyMap,
  peerDependencies: DependencyMap,
});
const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest));

/**
 * Reads a workspace `package.json`; none when it has no name. A manifest that
 * does not decode fails, so the deploy builds instead of losing a dependency.
 * @internal
 */
export const parseWorkspacePackage = Effect.fn("parseWorkspacePackage")(function* (opts: {
  dir: string;
  manifest: string;
}) {
  const manifest = yield* decodeManifest(opts.manifest).pipe(
    Effect.mapError((cause) => new InvalidManifestError({ cause, dir: opts.dir })),
  );
  return Option.fromUndefinedOr(manifest.name).pipe(
    Option.map((name): WorkspacePackage => ({
      dependencies: DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})),
      dir: opts.dir,
      name,
    })),
  );
});

/**
 * Every package matched by `pnpm-workspace.yaml` under `root`.
 * @internal
 */
export const readWorkspacePackages = Effect.fn("readWorkspacePackages")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const globs = parseWorkspaceGlobs(
    yield* fs.readFileString(path.join(root, "pnpm-workspace.yaml")),
  );
  const excluded = globs.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1));
  const manifests = yield* Effect.forEach(
    globs.filter((glob) => !glob.startsWith("!")),
    (glob) => fs.glob(`${glob}/package.json`, { root }),
    { concurrency: "unbounded" },
  );
  const dirs = new Set(
    manifests
      .flat()
      .map((manifest) => path.dirname(manifest))
      .filter((dir) => !excluded.some((glob) => matchesGlob(dir, glob))),
  );
  const packages = yield* Effect.forEach(
    [...dirs].toSorted(),
    (dir) =>
      fs
        .readFileString(path.join(root, dir, "package.json"))
        .pipe(Effect.flatMap((manifest) => parseWorkspacePackage({ dir, manifest }))),
    { concurrency: "unbounded" },
  );
  return packages.flatMap(Option.toArray);
});

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
 * @internal
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

/**
 * Where to deepen a shallow clone from, or none to never fetch. Vercel's clone
 * has no `origin` remote, so fall back to the public GitHub URL. Full clones are
 * never fetched into: `fetch --depth` would make them shallow.
 */
const fetchSource = Effect.fnUntraced(function* (deploy: VercelDeploy) {
  const git = yield* Git;
  const shallow = yield* Effect.option(git.run(["rev-parse", "--is-shallow-repository"]));
  if (!Option.contains(shallow, "true")) {
    return Option.none<string>();
  }
  if (yield* Effect.isSuccess(git.run(["remote", "get-url", "origin"]))) {
    return Option.some("origin");
  }
  return Option.all([deploy.repoOwner, deploy.repoSlug]).pipe(
    Option.filter(() => Option.contains(deploy.provider, "github")),
    Option.map(([owner, slug]) => `https://github.com/${owner}/${slug}.git`),
  );
});

const hasCommit = Effect.fnUntraced(function* (opts: { deploy: VercelDeploy; sha: string }) {
  const git = yield* Git;
  const verify = Effect.isSuccess(git.run(["cat-file", "-e", `${opts.sha}^{commit}`]));
  if (yield* verify) {
    return true;
  }
  const source = yield* fetchSource(opts.deploy);
  if (Option.isNone(source)) {
    return false;
  }
  yield* Effect.ignore(git.run(["fetch", "--no-tags", "--depth=1", source.value, opts.sha]));
  return yield* verify;
});

const mergeBaseWithProduction = Effect.fnUntraced(function* (deploy: VercelDeploy) {
  const git = yield* Git;
  const mergeBase = Effect.option(git.run(["merge-base", "HEAD", PRODUCTION_REF]));
  const local = yield* mergeBase;
  if (Option.isSome(local)) {
    return local;
  }
  const head = yield* Effect.option(git.run(["rev-parse", "HEAD"]));
  const source = yield* fetchSource(deploy);
  if (Option.isNone(head) || Option.isNone(source)) {
    return Option.none<string>();
  }
  for (const depth of FETCH_DEPTHS) {
    yield* Effect.ignore(
      git.run([
        "fetch",
        "--no-tags",
        `--depth=${depth}`,
        source.value,
        head.value,
        `+refs/heads/${PRODUCTION_BRANCH}:${PRODUCTION_REF}`,
      ]),
    );
    const base = yield* mergeBase;
    if (Option.isSome(base)) {
      return base;
    }
  }
  return Option.none<string>();
});

/**
 * Diffs against the last successful deploy of this branch when Vercel knows it,
 * else (a branch's first deploy) against its merge-base with `main`. Production
 * without a previous deploy has no safe base, so it builds.
 * @internal
 */
export const resolveDiffBase = Effect.fn("resolveDiffBase")(function* (deploy: VercelDeploy) {
  if (Option.isSome(deploy.previousSha)) {
    const sha = deploy.previousSha.value;
    if (!(yield* hasCommit({ deploy, sha }))) {
      return yield* new NoDiffBaseError({ reason: `previous deploy ${sha} is not fetchable` });
    }
    return { sha, source: "VERCEL_GIT_PREVIOUS_SHA" };
  }
  if (
    Option.contains(deploy.environment, "production") ||
    Option.contains(deploy.branch, PRODUCTION_BRANCH)
  ) {
    return yield* new NoDiffBaseError({ reason: "production has no previous successful deploy" });
  }
  const sha = yield* mergeBaseWithProduction(deploy);
  if (Option.isNone(sha)) {
    return yield* new NoDiffBaseError({ reason: `no merge-base with ${PRODUCTION_BRANCH}` });
  }
  return { sha: sha.value, source: `merge-base with ${PRODUCTION_BRANCH}` };
});

const decide = Effect.gen(function* () {
  const git = yield* Git;
  const root = yield* git.run(["rev-parse", "--show-toplevel"]);
  // The cwd relative to the repo root, e.g. `projects/isbabyoutyet/web/`.
  const prefix = yield* git.run(["rev-parse", "--show-prefix"]);
  const base = yield* resolveDiffBase(yield* VercelDeploy);
  yield* Console.log(`Comparing HEAD with ${base.sha} (${base.source})`);
  const diff = yield* git.run(["diff", "--name-only", "--no-renames", "-z", base.sha, "HEAD"]);
  return decideBuild({
    changedFiles: diff.split("\0").filter((file) => file !== ""),
    packages: yield* readWorkspacePackages(root),
    projectDir: prefix.replace(/\/$/u, ""),
  });
});

/** Logs the decision and returns Vercel's exit code for it. */
const report = Effect.fnUntraced(function* (decision: BuildDecision) {
  switch (decision.kind) {
    case "build": {
      yield* Console.log(`Building: ${decision.reason}`);
      for (const file of decision.files.slice(0, MAX_LISTED_FILES)) {
        yield* Console.log(`  ${file}`);
      }
      return BUILD;
    }
    case "skip": {
      yield* Console.log(`Skipping: ${decision.reason}`);
      return SKIP;
    }
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
});

/** A typed error names the step that failed; anything else is a crash. */
function buildBecause(cause: Cause.Cause<{ readonly message: string }>): BuildDecision {
  const reason = Option.match(Cause.findErrorOption(cause), {
    onNone: () => `ignore check crashed: ${Cause.pretty(cause)}`,
    onSome: (error) => error.message,
  });
  return { files: [], kind: "build", reason };
}

/**
 * The `ignoreCommand` program: `SKIP` or `BUILD`. It never fails, so a broken
 * check (an error or a defect) builds and logs why instead of stopping deploys.
 */
export const vercelIgnore = decide.pipe(
  Effect.catchCause((cause) => Effect.succeed(buildBecause(cause))),
  Effect.flatMap(report),
);
