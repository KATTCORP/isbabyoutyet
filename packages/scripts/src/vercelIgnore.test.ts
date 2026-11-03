import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { Git, VercelDeploy, WorkspacePackage } from "./vercelIgnore.ts";
import {
  decideBuild,
  parseWorkspaceGlobs,
  parseWorkspacePackage,
  readWorkspacePackages,
  resolveDiffBase,
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
  test.each([
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

  test("lists only the files that force the build", () => {
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

  test("builds when the project directory is not a workspace package", () => {
    expect(
      decideBuild({ changedFiles: ["README.md"], packages, projectDir: "projects/nope/web" }),
    ).toMatchObject({ kind: "build" });
  });

  test("terminates on dependency cycles", () => {
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
  const workspace = readWorkspacePackages(root);

  test.each([
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
  ])("$name", (row) => {
    expect(
      [ISBABY, SOUS].map(
        (projectDir) =>
          decideBuild({ changedFiles: row.files, packages: workspace, projectDir }).kind,
      ),
    ).toStrictEqual(row.expected);
  });
});

describe("parseWorkspaceGlobs", () => {
  test("reads the packages list and stops at the next key", () => {
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

  test("returns nothing without a block list", () => {
    expect(parseWorkspaceGlobs("packages: [apps/*]\n")).toStrictEqual([]);
  });
});

describe("parseWorkspacePackage", () => {
  test("collects names from every dependency field", () => {
    const manifest = JSON.stringify({
      dependencies: { "@workspace/ui": "workspace:*", react: "^19.0.0" },
      devDependencies: { "@workspace/tsconfig": "workspace:*" },
      name: "@sous-vide-guide/web",
      optionalDependencies: "not an object",
      peerDependencies: { vite: "*" },
    });
    expect(parseWorkspacePackage({ dir: SOUS, manifest })).toStrictEqual({
      dependencies: ["@workspace/ui", "react", "@workspace/tsconfig", "vite"],
      dir: SOUS,
      name: "@sous-vide-guide/web",
    });
  });

  test("skips manifests without a name", () => {
    expect(parseWorkspacePackage({ dir: "x", manifest: "{}" })).toBeNull();
    expect(parseWorkspacePackage({ dir: "x", manifest: "[]" })).toBeNull();
  });
});

/** Replays canned outputs per command (the last one repeats) and records every call. */
function scriptedGit(script: ReadonlyArray<readonly [string, ReadonlyArray<string | null>]>) {
  const outputs = new Map(script.map((entry) => [entry[0], [...entry[1]]]));
  const calls: Array<string> = [];
  const git: Git = (args) => {
    const command = args.join(" ");
    calls.push(command);
    const queue = outputs.get(command) ?? [null];
    return (queue.length > 1 ? queue.shift() : queue[0]) ?? null;
  };
  return { calls, git };
}

const PREVIEW: VercelDeploy = {
  branch: "cursor/feature",
  environment: "preview",
  previousSha: undefined,
  provider: "github",
  repoOwner: "KATTCORP",
  repoSlug: "isbabyoutyet",
};
const GITHUB = "https://github.com/KATTCORP/isbabyoutyet.git";
const MERGE_BASE = "merge-base HEAD refs/remotes/origin/main";
const ORIGIN = "remote get-url origin";
const SHALLOW = "rev-parse --is-shallow-repository";

function fetches(calls: ReadonlyArray<string>) {
  return calls.filter((call) => call.startsWith("fetch"));
}

describe("resolveDiffBase", () => {
  test("uses the previous deploy when its commit is present", () => {
    const git = scriptedGit([["cat-file -e abc^{commit}", [""]]]);
    expect(
      resolveDiffBase({ deploy: { ...PREVIEW, previousSha: "abc" }, git: git.git }),
    ).toStrictEqual({ kind: "found", sha: "abc", source: "VERCEL_GIT_PREVIOUS_SHA" });
    expect(git.calls).toStrictEqual(["cat-file -e abc^{commit}"]);
  });

  test("fetches the previous deploy into a shallow clone from origin", () => {
    const git = scriptedGit([
      ["cat-file -e abc^{commit}", [null, ""]],
      [SHALLOW, ["true"]],
      [ORIGIN, [GITHUB]],
    ]);
    expect(
      resolveDiffBase({ deploy: { ...PREVIEW, previousSha: "abc" }, git: git.git }),
    ).toMatchObject({ kind: "found", sha: "abc" });
    expect(fetches(git.calls)).toStrictEqual(["fetch --no-tags --depth=1 origin abc"]);
  });

  test("fetches from the GitHub repo Vercel names when there is no origin", () => {
    const git = scriptedGit([
      ["cat-file -e abc^{commit}", [null, ""]],
      [SHALLOW, ["true"]],
    ]);
    expect(
      resolveDiffBase({ deploy: { ...PREVIEW, previousSha: "abc" }, git: git.git }),
    ).toMatchObject({ kind: "found", sha: "abc" });
    expect(fetches(git.calls)).toStrictEqual([`fetch --no-tags --depth=1 ${GITHUB} abc`]);
  });

  test("never fetches without origin or a GitHub repo to fetch from", () => {
    const git = scriptedGit([
      [MERGE_BASE, [null]],
      ["rev-parse HEAD", ["head"]],
      [SHALLOW, ["true"]],
    ]);
    const deploy = { ...PREVIEW, provider: "gitlab" };
    expect(resolveDiffBase({ deploy, git: git.git })).toMatchObject({ kind: "unknown" });
    expect(
      resolveDiffBase({ deploy: { ...deploy, previousSha: "abc" }, git: git.git }),
    ).toMatchObject({ kind: "unknown" });
    expect(fetches(git.calls)).toStrictEqual([]);
  });

  test("gives up on a previous deploy that cannot be fetched", () => {
    const git = scriptedGit([[SHALLOW, ["true"]]]);
    expect(
      resolveDiffBase({ deploy: { ...PREVIEW, previousSha: "abc" }, git: git.git }),
    ).toMatchObject({ kind: "unknown" });
  });

  test("never fetches into a full clone", () => {
    const git = scriptedGit([[SHALLOW, ["false"]]]);
    expect(
      resolveDiffBase({ deploy: { ...PREVIEW, previousSha: "abc" }, git: git.git }),
    ).toMatchObject({ kind: "unknown" });
    expect(resolveDiffBase({ deploy: PREVIEW, git: git.git })).toMatchObject({
      kind: "unknown",
    });
    expect(fetches(git.calls)).toStrictEqual([]);
  });

  test.each([
    { branch: "main", environment: "production" },
    { branch: "main", environment: undefined },
    { branch: "hotfix", environment: "production" },
  ])("has no base for production without a previous deploy ($branch, $environment)", (row) => {
    const git = scriptedGit([[MERGE_BASE, ["def"]]]);
    expect(resolveDiffBase({ deploy: { ...PREVIEW, ...row }, git: git.git })).toMatchObject({
      kind: "unknown",
    });
    expect(git.calls).toStrictEqual([]);
  });

  test("uses the merge-base with main on a branch's first deploy", () => {
    const git = scriptedGit([[MERGE_BASE, ["def"]]]);
    expect(resolveDiffBase({ deploy: PREVIEW, git: git.git })).toStrictEqual({
      kind: "found",
      sha: "def",
      source: "merge-base with main",
    });
  });

  test("deepens a shallow clone until the merge-base appears", () => {
    const git = scriptedGit([
      [MERGE_BASE, [null, null, "def"]],
      ["rev-parse HEAD", ["head"]],
      [SHALLOW, ["true"]],
    ]);
    expect(resolveDiffBase({ deploy: PREVIEW, git: git.git })).toMatchObject({ sha: "def" });
    expect(fetches(git.calls)).toStrictEqual([
      `fetch --no-tags --depth=100 ${GITHUB} head +refs/heads/main:refs/remotes/origin/main`,
      `fetch --no-tags --depth=1000 ${GITHUB} head +refs/heads/main:refs/remotes/origin/main`,
    ]);
  });

  test("has no base when deepening never finds a merge-base", () => {
    const git = scriptedGit([
      ["rev-parse HEAD", ["head"]],
      [SHALLOW, ["true"]],
    ]);
    expect(resolveDiffBase({ deploy: PREVIEW, git: git.git })).toStrictEqual({
      kind: "unknown",
      reason: "no merge-base with main",
    });
  });
});
