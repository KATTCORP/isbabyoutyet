import { matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
  Result,
} from "effect";
import { ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import type { VercelDeploy, WorkspacePackage } from "./vercelIgnore.ts";
import {
  BUILD,
  decideBuild,
  Git,
  GitError,
  InvalidManifestError,
  NoDiffBaseError,
  parseWorkspaceGlobs,
  parseWorkspacePackage,
  readWorkspacePackages,
  resolveDiffBase,
  SKIP,
  vercelIgnore,
} from "./vercelIgnore.ts";

const ISBABY = "projects/isbabyoutyet/web";
const SOUS = "projects/sous-vide-guide/web";

const packages: ReadonlyArray<WorkspacePackage> = [
  {
    dependencies: ["@isbabyoutyet/backend", "@workspace/ui", "react"],
    dir: ISBABY,
    name: "@isbabyoutyet/web",
  },
  {
    dependencies: ["@isbabyoutyet/email", "convex"],
    dir: "projects/isbabyoutyet/backend",
    name: "@isbabyoutyet/backend",
  },
  {
    dependencies: ["@workspace/tsconfig"],
    dir: "projects/isbabyoutyet/email",
    name: "@isbabyoutyet/email",
  },
  { dependencies: ["@workspace/ui"], dir: SOUS, name: "@sous-vide-guide/web" },
  { dependencies: ["@workspace/tsconfig"], dir: "packages/ui", name: "@workspace/ui" },
  {
    dependencies: ["@workspace/tsconfig"],
    dir: "packages/oxlint-plugins",
    name: "@workspace/oxlint-plugins",
  },
  { dependencies: [], dir: "tooling/typescript", name: "@workspace/tsconfig" },
];

function kinds(changedFiles: ReadonlyArray<string>) {
  return [ISBABY, SOUS].map(
    (projectDir) => decideBuild({ changedFiles, packages, projectDir }).kind,
  );
}

describe("decideBuild", () => {
  it.each([
    { expected: ["skip", "skip"], files: ["README.md"], name: "root README (#469)" },
    {
      expected: ["skip", "skip"],
      files: [
        ".oxlintrc.json",
        "packages/oxlint-plugins/no-unused-loader-data.ts",
        "packages/oxlint-plugins/no-unused-loader-data.test.ts",
      ],
      name: "lint plugin and root lint config (#470)",
    },
    {
      expected: ["skip", "skip"],
      files: [
        ".agents/skills/tdd/SKILL.md",
        ".cursor/rules/guidelines.mdc",
        ".github/workflows/ci.yml",
        ".repos/effect/LLMS.md",
        "knip.json",
        "vendor-src.json",
      ],
      name: "repo tooling outside every workspace",
    },
    {
      expected: ["skip", "skip"],
      files: [
        `${ISBABY}/src/routes/index.test.tsx`,
        `${ISBABY}/src/lib/format.spec.ts`,
        `${ISBABY}/vitest.config.ts`,
        `${ISBABY}/AGENTS.md`,
        "projects/isbabyoutyet/backend/.agents/skills/convex/SKILL.md",
        "projects/isbabyoutyet/backend/.claude/skills/convex/agent.json",
        "projects/isbabyoutyet/backend/skills-lock.json",
      ],
      name: "tests, docs and agent config inside a deployed workspace",
    },
    {
      expected: ["build", "skip"],
      files: [`${ISBABY}/src/routes/index.tsx`],
      name: "isbabyoutyet web source",
    },
    {
      expected: ["build", "skip"],
      files: ["projects/isbabyoutyet/backend/convex/schema.ts"],
      name: "Convex backend, which the isbabyoutyet build deploys",
    },
    {
      expected: ["build", "skip"],
      files: ["projects/isbabyoutyet/email/emails/welcome.tsx"],
      name: "a transitive dependency",
    },
    {
      expected: ["build", "build"],
      files: ["packages/ui/src/components/button.tsx"],
      name: "a shared dependency",
    },
    {
      expected: ["build", "build"],
      files: ["tooling/typescript/base.json"],
      name: "a dev dependency of a dependency",
    },
    {
      expected: ["skip", "build"],
      files: [`${SOUS}/vercel.json`],
      name: "the project's own vercel.json",
    },
    ...[
      ".npmrc",
      ".nvmrc",
      "package.json",
      "patches/convex.patch",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
    ].map((file) => ({ expected: ["build", "build"], files: [file], name: `root ${file}` })),
    { expected: ["build", "build"], files: [], name: "an empty diff (redeploy)" },
  ])("$name", (row) => {
    expect(kinds(row.files)).toStrictEqual(row.expected);
  });

  it("lists only the files that force the build", () => {
    expect(
      decideBuild({
        changedFiles: ["README.md", `${ISBABY}/src/a.test.ts`, `${ISBABY}/src/a.ts`],
        packages,
        projectDir: ISBABY,
      }),
    ).toStrictEqual({
      files: [`${ISBABY}/src/a.ts`],
      kind: "build",
      reason: "1 of 3 changed file(s) are build inputs of @isbabyoutyet/web",
    });
  });

  it("builds when the project directory is not a workspace package", () => {
    expect(
      decideBuild({ changedFiles: ["README.md"], packages, projectDir: "projects/nope/web" }),
    ).toMatchObject({ kind: "build" });
  });

  it("terminates on dependency cycles", () => {
    const cyclic: ReadonlyArray<WorkspacePackage> = [
      { dependencies: ["b"], dir: "a", name: "a" },
      { dependencies: ["a"], dir: "b", name: "b" },
    ];
    expect(
      decideBuild({ changedFiles: ["b/index.ts"], packages: cyclic, projectDir: "a" }).kind,
    ).toBe("build");
  });
});

describe("the real workspace graph", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));

  it.effect.each([
    { expected: ["skip", "skip"], files: ["README.md"], name: "#469 README" },
    {
      expected: ["skip", "skip"],
      files: [
        ".oxlintrc.json",
        "packages/oxlint-plugins/no-unused-loader-data.test.ts",
        "packages/oxlint-plugins/no-unused-loader-data.ts",
        "packages/oxlint-plugins/workspace.ts",
      ],
      name: "#470 lint rule",
    },
    {
      expected: ["build", "skip"],
      files: [
        `${ISBABY}/src/routes/_auth/dashboard_.admin/babies.test.tsx`,
        `${ISBABY}/src/routes/_auth/dashboard_.admin/babies.tsx`,
      ],
      name: "#467 admin route",
    },
    {
      expected: ["build", "skip"],
      files: ["projects/isbabyoutyet/backend/convex/schema.ts"],
      name: "backend",
    },
    {
      expected: ["build", "build"],
      files: ["packages/ui/src/lib/utils.ts"],
      name: "shared ui",
    },
  ])("$name", (row) =>
    Effect.gen(function* () {
      const workspace = yield* readWorkspacePackages(root);
      expect(
        [ISBABY, SOUS].map(
          (projectDir) =>
            decideBuild({ changedFiles: row.files, packages: workspace, projectDir }).kind,
        ),
      ).toStrictEqual(row.expected);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("parseWorkspaceGlobs", () => {
  it("reads the packages list and stops at the next key", () => {
    const yaml = [
      "# comment",
      "packages:",
      "  - projects/*/*",
      '  - "packages/*" # quoted',
      "",
      "  - '!**/fixtures/**'",
      "",
      "catalogMode: prefer",
      "onlyBuiltDependencies:",
      "  - esbuild",
    ].join("\n");
    expect(parseWorkspaceGlobs(yaml)).toStrictEqual([
      "projects/*/*",
      "packages/*",
      "!**/fixtures/**",
    ]);
  });

  it("returns nothing without a block list", () => {
    expect(parseWorkspaceGlobs("packages: [apps/*]\n")).toStrictEqual([]);
  });
});

describe("parseWorkspacePackage", () => {
  it.effect("collects names from every dependency field", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        dependencies: { "@workspace/ui": "workspace:*", react: "^19.0.0" },
        devDependencies: { "@workspace/tsconfig": "workspace:*" },
        name: "@sous-vide-guide/web",
        peerDependencies: { vite: "*" },
      });
      expect(yield* parseWorkspacePackage({ dir: SOUS, manifest })).toStrictEqual(
        Option.some({
          dependencies: ["@workspace/ui", "react", "@workspace/tsconfig", "vite"],
          dir: SOUS,
          name: "@sous-vide-guide/web",
        }),
      );
    }),
  );

  it.effect("skips manifests without a name", () =>
    Effect.gen(function* () {
      expect(yield* parseWorkspacePackage({ dir: "x", manifest: "{}" })).toStrictEqual(
        Option.none(),
      );
    }),
  );

  it.effect.each(['{"name":"x","optionalDependencies":"not an object"}', "[]", "{"])(
    "fails on a manifest that does not decode (%s)",
    (manifest) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseWorkspacePackage({ dir: "x", manifest }));
        expect(error).toBeInstanceOf(InvalidManifestError);
        expect(error.message).toMatch(/^x\/package\.json is not a valid manifest: /u);
      }),
  );
});

type GitScript = ReadonlyArray<readonly [string, ReadonlyArray<string | null>]>;

/** Replays canned outputs per command (`null` fails; the last repeats) and records every call. */
function scriptedGit(script: GitScript) {
  const outputs = new Map(script.map((entry) => [entry[0], [...entry[1]]]));
  const calls: Array<string> = [];
  const layer = Layer.succeed(
    Git,
    Git.of({
      run: (args) =>
        Effect.suspend(() => {
          const command = args.join(" ");
          calls.push(command);
          const queue = outputs.get(command) ?? [null];
          const output = (queue.length > 1 ? queue.shift() : queue[0]) ?? null;
          return output === null
            ? Effect.fail(new GitError({ args, reason: "scripted failure" }))
            : Effect.succeed(output);
        }),
    }),
  );
  return { calls, layer };
}

const PREVIEW: VercelDeploy = {
  branch: Option.some("cursor/feature"),
  environment: Option.some("preview"),
  previousSha: Option.none(),
  provider: Option.some("github"),
  repoOwner: Option.some("KATTCORP"),
  repoSlug: Option.some("isbabyoutyet"),
};
const WITH_PREVIOUS: VercelDeploy = { ...PREVIEW, previousSha: Option.some("abc") };
const GITHUB = "https://github.com/KATTCORP/isbabyoutyet.git";
const MERGE_BASE = "merge-base HEAD refs/remotes/origin/main";
const ORIGIN = "remote get-url origin";
const SHALLOW = "rev-parse --is-shallow-repository";

function fetches(calls: ReadonlyArray<string>) {
  return calls.filter((call) => call.startsWith("fetch"));
}

function resolve(deploy: VercelDeploy, git: ReturnType<typeof scriptedGit>) {
  return resolveDiffBase(deploy).pipe(Effect.result, Effect.provide(git.layer));
}

describe("resolveDiffBase", () => {
  it.effect("uses the previous deploy when its commit is present", () =>
    Effect.gen(function* () {
      const git = scriptedGit([["cat-file -e abc^{commit}", [""]]]);
      expect(yield* resolve(WITH_PREVIOUS, git)).toStrictEqual(
        Result.succeed({ sha: "abc", source: "VERCEL_GIT_PREVIOUS_SHA" }),
      );
      expect(git.calls).toStrictEqual(["cat-file -e abc^{commit}"]);
    }),
  );

  it.effect("fetches the previous deploy into a shallow clone from origin", () =>
    Effect.gen(function* () {
      const git = scriptedGit([
        ["cat-file -e abc^{commit}", [null, ""]],
        [SHALLOW, ["true"]],
        [ORIGIN, [GITHUB]],
      ]);
      expect(Result.isSuccess(yield* resolve(WITH_PREVIOUS, git))).toBe(true);
      expect(fetches(git.calls)).toStrictEqual(["fetch --no-tags --depth=1 origin abc"]);
    }),
  );

  it.effect("fetches from the GitHub repo Vercel names when there is no origin", () =>
    Effect.gen(function* () {
      const git = scriptedGit([
        ["cat-file -e abc^{commit}", [null, ""]],
        [SHALLOW, ["true"]],
      ]);
      expect(Result.isSuccess(yield* resolve(WITH_PREVIOUS, git))).toBe(true);
      expect(fetches(git.calls)).toStrictEqual([`fetch --no-tags --depth=1 ${GITHUB} abc`]);
    }),
  );

  it.effect("never fetches without origin or a GitHub repo to fetch from", () =>
    Effect.gen(function* () {
      const git = scriptedGit([
        [MERGE_BASE, [null]],
        ["rev-parse HEAD", ["head"]],
        [SHALLOW, ["true"]],
      ]);
      const deploy = { ...PREVIEW, provider: Option.some("gitlab") };
      expect(Result.isFailure(yield* resolve(deploy, git))).toBe(true);
      expect(
        Result.isFailure(yield* resolve({ ...deploy, previousSha: Option.some("abc") }, git)),
      ).toBe(true);
      expect(fetches(git.calls)).toStrictEqual([]);
    }),
  );

  it.effect("gives up on a previous deploy that cannot be fetched", () =>
    Effect.gen(function* () {
      const git = scriptedGit([[SHALLOW, ["true"]]]);
      expect(yield* resolve(WITH_PREVIOUS, git)).toStrictEqual(
        Result.fail(new NoDiffBaseError({ reason: "previous deploy abc is not fetchable" })),
      );
    }),
  );

  it.effect("never fetches into a full clone", () =>
    Effect.gen(function* () {
      const git = scriptedGit([[SHALLOW, ["false"]]]);
      expect(Result.isFailure(yield* resolve(WITH_PREVIOUS, git))).toBe(true);
      expect(Result.isFailure(yield* resolve(PREVIEW, git))).toBe(true);
      expect(fetches(git.calls)).toStrictEqual([]);
    }),
  );

  it.effect.each([
    { branch: Option.some("main"), environment: Option.some("production") },
    { branch: Option.some("main"), environment: Option.none() },
    { branch: Option.some("hotfix"), environment: Option.some("production") },
  ])("has no base for production without a previous deploy (%o)", (row) =>
    Effect.gen(function* () {
      const git = scriptedGit([[MERGE_BASE, ["def"]]]);
      expect(yield* resolve({ ...PREVIEW, ...row }, git)).toStrictEqual(
        Result.fail(
          new NoDiffBaseError({ reason: "production has no previous successful deploy" }),
        ),
      );
      expect(git.calls).toStrictEqual([]);
    }),
  );

  it.effect("uses the merge-base with main on a branch's first deploy", () =>
    Effect.gen(function* () {
      const git = scriptedGit([[MERGE_BASE, ["def"]]]);
      expect(yield* resolve(PREVIEW, git)).toStrictEqual(
        Result.succeed({ sha: "def", source: "merge-base with main" }),
      );
    }),
  );

  it.effect("deepens a shallow clone until the merge-base appears", () =>
    Effect.gen(function* () {
      const git = scriptedGit([
        [MERGE_BASE, [null, null, "def"]],
        ["rev-parse HEAD", ["head"]],
        [SHALLOW, ["true"]],
      ]);
      expect(yield* resolve(PREVIEW, git)).toStrictEqual(
        Result.succeed({ sha: "def", source: "merge-base with main" }),
      );
      expect(fetches(git.calls)).toStrictEqual([
        `fetch --no-tags --depth=100 ${GITHUB} head +refs/heads/main:refs/remotes/origin/main`,
        `fetch --no-tags --depth=1000 ${GITHUB} head +refs/heads/main:refs/remotes/origin/main`,
      ]);
    }),
  );

  it.effect("has no base when deepening never finds a merge-base", () =>
    Effect.gen(function* () {
      const git = scriptedGit([
        ["rev-parse HEAD", ["head"]],
        [SHALLOW, ["true"]],
      ]);
      expect(yield* resolve(PREVIEW, git)).toStrictEqual(
        Result.fail(new NoDiffBaseError({ reason: "no merge-base with main" })),
      );
    }),
  );
});

const ROOT = "/repo";

/** A two-project workspace on an in-memory file system, keyed by absolute path. */
const WORKSPACE = {
  [`${ROOT}/${ISBABY}/package.json`]: JSON.stringify({
    dependencies: { "@workspace/ui": "workspace:*" },
    name: "@isbabyoutyet/web",
  }),
  [`${ROOT}/${SOUS}/package.json`]: JSON.stringify({ name: "@sous-vide-guide/web" }),
  [`${ROOT}/packages/ui/package.json`]: JSON.stringify({ name: "@workspace/ui" }),
  [`${ROOT}/pnpm-workspace.yaml`]: "packages:\n  - projects/*/*\n  - packages/*\n",
} satisfies Record<string, string>;

function memoryFileSystem(files: Record<string, string>) {
  return FileSystem.layerNoop({
    glob: (pattern, options) =>
      Effect.sync(() => {
        const root = `${options?.root ?? "."}/`;
        return Object.keys(files)
          .filter((file) => file.startsWith(root))
          .map((file) => file.slice(root.length))
          .filter((file) => matchesGlob(file, pattern));
      }),
    readFileString: (path) =>
      Option.match(Option.fromUndefinedOr(files[path]), {
        onNone: () => Effect.die(`Unexpected read of ${path}`),
        onSome: Effect.succeed,
      }),
  });
}

/** Runs the whole `ignoreCommand` program from `projects/isbabyoutyet/web`. */
function runIgnore(opts: {
  env: Record<string, string>;
  files: Record<string, string>;
  git: GitScript;
}) {
  const git = scriptedGit([
    ["rev-parse --show-toplevel", [ROOT]],
    ["rev-parse --show-prefix", [`${ISBABY}/`]],
    ...opts.git,
  ]);
  return Effect.gen(function* () {
    const code = yield* vercelIgnore;
    const logs = yield* TestConsole.logLines;
    return { calls: git.calls, code, logs };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        git.layer,
        memoryFileSystem(opts.files),
        Path.layer,
        ConfigProvider.layer(ConfigProvider.fromUnknown(opts.env)),
      ),
    ),
  );
}

const PREVIEW_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "cursor/feature" };
const PREVIOUS_ENV = { ...PREVIEW_ENV, VERCEL_GIT_PREVIOUS_SHA: "abc" };
const HAS_ABC = ["cat-file -e abc^{commit}", [""]] as const;

function diffSince(base: string, files: ReadonlyArray<string>) {
  return [
    `diff --name-only --no-renames -z ${base} HEAD`,
    [files.map((file) => `${file}\0`).join("")],
  ] as const;
}

describe("vercelIgnore", () => {
  it.effect("skips when nothing changed is a build input", () =>
    Effect.gen(function* () {
      const run = yield* runIgnore({
        env: PREVIOUS_ENV,
        files: WORKSPACE,
        git: [HAS_ABC, diffSince("abc", ["README.md", `${SOUS}/src/app.tsx`])],
      });
      expect(run.code).toBe(SKIP);
      expect(run.logs).toStrictEqual([
        "Comparing HEAD with abc (VERCEL_GIT_PREVIOUS_SHA)",
        "Skipping: none of 2 changed file(s) are build inputs of @isbabyoutyet/web",
      ]);
    }),
  );

  it.effect("builds and lists at most 20 of the files that force it", () =>
    Effect.gen(function* () {
      const files = Array.from({ length: 25 }, (_, index) => `packages/ui/src/${index}.ts`);
      const run = yield* runIgnore({
        env: PREVIOUS_ENV,
        files: WORKSPACE,
        git: [HAS_ABC, diffSince("abc", files)],
      });
      expect(run.code).toBe(BUILD);
      expect(run.logs).toStrictEqual([
        "Comparing HEAD with abc (VERCEL_GIT_PREVIOUS_SHA)",
        "Building: 25 of 25 changed file(s) are build inputs of @isbabyoutyet/web",
        ...files.slice(0, 20).map((file) => `  ${file}`),
      ]);
    }),
  );

  it.effect("treats an empty VERCEL_GIT_PREVIOUS_SHA as a first deploy", () =>
    Effect.gen(function* () {
      const run = yield* runIgnore({
        env: { ...PREVIEW_ENV, VERCEL_GIT_PREVIOUS_SHA: "" },
        files: WORKSPACE,
        git: [[MERGE_BASE, ["def"]], diffSince("def", ["README.md"])],
      });
      expect(run.code).toBe(SKIP);
      expect(run.logs[0]).toBe("Comparing HEAD with def (merge-base with main)");
    }),
  );

  it.effect.each([
    {
      env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" },
      git: [],
      name: "there is no diff base",
      reason: "no diff base: production has no previous successful deploy",
    },
    {
      env: PREVIOUS_ENV,
      git: [["rev-parse --show-toplevel", [null]]],
      name: "it runs outside a git checkout",
      reason: "git rev-parse --show-toplevel failed: scripted failure",
    },
    {
      env: PREVIOUS_ENV,
      git: [HAS_ABC],
      name: "the diff fails",
      reason: "git diff --name-only --no-renames -z abc HEAD failed: scripted failure",
    },
  ] satisfies ReadonlyArray<{
    env: Record<string, string>;
    git: GitScript;
    name: string;
    reason: string;
  }>)("builds when $name", (row) =>
    Effect.gen(function* () {
      const run = yield* runIgnore({ env: row.env, files: WORKSPACE, git: row.git });
      expect(run.code).toBe(BUILD);
      expect(run.logs.at(-1)).toBe(`Building: ${row.reason}`);
    }),
  );

  it.effect("builds when a workspace manifest does not decode", () =>
    Effect.gen(function* () {
      const run = yield* runIgnore({
        env: PREVIOUS_ENV,
        files: { ...WORKSPACE, [`${ROOT}/packages/ui/package.json`]: "{" },
        git: [HAS_ABC, diffSince("abc", ["README.md"])],
      });
      expect(run.code).toBe(BUILD);
      expect(run.logs.at(-1)).toMatch(
        /^Building: packages\/ui\/package\.json is not a valid manifest: /u,
      );
    }),
  );

  it.effect("builds and logs the defect when the check crashes", () =>
    Effect.gen(function* () {
      const code = yield* vercelIgnore;
      const logs = yield* TestConsole.logLines;
      expect(code).toBe(BUILD);
      expect(logs).toStrictEqual([
        expect.stringMatching(/^Building: ignore check crashed: .*boom/su),
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(Git, Git.of({ run: () => Effect.die(new Error("boom")) })),
          memoryFileSystem(WORKSPACE),
          Path.layer,
          ConfigProvider.layer(ConfigProvider.fromUnknown(PREVIOUS_ENV)),
        ),
      ),
    ),
  );
});

describe("Git.layer", () => {
  const live = Git.layer.pipe(Layer.provide(NodeServices.layer));

  it.effect("returns trimmed stdout", () =>
    Effect.gen(function* () {
      const git = yield* Git;
      expect(yield* git.run(["rev-parse", "--is-inside-work-tree"])).toBe("true");
    }).pipe(Effect.provide(live)),
  );

  it.effect.each([
    { args: ["cat-file", "-e", "0000000000000000000000000000000000000000^{commit}"] },
    { args: ["fetch", "--no-tags", "--quiet", "/nonexistent/repo.git", "main"] },
  ])("fails with the exit code ($args.0)", (row) =>
    Effect.gen(function* () {
      const git = yield* Git;
      const error = yield* Effect.flip(git.run(row.args));
      expect(error).toBeInstanceOf(GitError);
      expect(error.reason).toMatch(/^exit code [1-9]/u);
    }).pipe(Effect.provide(live)),
  );

  it.effect("fails when git cannot be spawned", () =>
    Effect.gen(function* () {
      const git = yield* Git;
      const error = yield* Effect.flip(git.run(["status"]));
      expect(error).toStrictEqual(new GitError({ args: ["status"], reason: error.reason }));
      expect(error.reason).toMatch(/spawn/u);
    }).pipe(
      Effect.provide(
        Git.layer.pipe(
          Layer.provide(
            Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              ChildProcessSpawner.make(() =>
                Effect.fail(
                  PlatformError.badArgument({
                    description: "spawn git ENOENT",
                    method: "spawn",
                    module: "ChildProcess",
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
});
