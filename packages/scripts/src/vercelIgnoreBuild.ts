/**
 * Vercel `ignoreCommand` for a `projects/<name>/web` deploy. Vercel runs it from the
 * project's Root Directory, before install: exit 0 skips the deploy, exit 1
 * builds. Anything unexpected must exit 1 so a broken check cannot stop deploys.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import type { BuildDecision } from "./vercelIgnore.ts";
import { decideBuild, readWorkspacePackages, resolveDiffBase } from "./vercelIgnore.ts";

const MAX_LISTED_FILES = 20;
/** Re-vendoring `.repos/` lists tens of thousands of paths, past the 1 MiB default. */
const GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

function git(args: ReadonlyArray<string>) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      // A fetch that needs credentials must fail (and build), not wait on a prompt.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: GIT_OUTPUT_BYTES,
      // Probes such as `cat-file -e` fail by design; only fetch errors help in the log.
      stdio: ["ignore", "pipe", args[0] === "fetch" ? "inherit" : "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function decide(): BuildDecision {
  const root = git(["rev-parse", "--show-toplevel"]);
  if (root === null) {
    return { files: [], kind: "build", reason: "not inside a git checkout" };
  }
  const base = resolveDiffBase({
    deploy: {
      branch: process.env.VERCEL_GIT_COMMIT_REF,
      environment: process.env.VERCEL_ENV,
      previousSha: process.env.VERCEL_GIT_PREVIOUS_SHA,
    },
    git,
  });
  if (base.kind === "unknown") {
    return { files: [], kind: "build", reason: `no diff base: ${base.reason}` };
  }
  console.log(`Comparing HEAD with ${base.sha} (${base.source})`);
  const diff = git(["diff", "--name-only", "--no-renames", "-z", base.sha, "HEAD"]);
  if (diff === null) {
    return { files: [], kind: "build", reason: `git diff against ${base.sha} failed` };
  }
  return decideBuild({
    changedFiles: diff.split("\0").filter((file) => file !== ""),
    packages: readWorkspacePackages(root),
    projectDir: relative(root, realpathSync(process.cwd())),
  });
}

function decideOrBuild(): BuildDecision {
  try {
    return decide();
  } catch (error) {
    return { files: [], kind: "build", reason: `ignore check crashed: ${String(error)}` };
  }
}

/** Logs the decision and returns Vercel's exit code for it. */
function report(decision: BuildDecision) {
  switch (decision.kind) {
    case "build": {
      console.log(`Building: ${decision.reason}`);
      for (const file of decision.files.slice(0, MAX_LISTED_FILES)) {
        console.log(`  ${file}`);
      }
      return 1;
    }
    case "skip": {
      console.log(`Skipping: ${decision.reason}`);
      return 0;
    }
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

process.exitCode = report(decideOrBuild());
