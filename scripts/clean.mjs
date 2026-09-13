#!/usr/bin/env node
/**
 * Remove install/build/test artifacts that are not in git, then reinstall.
 * Leaves source, message catalogs, and Convex function sources alone.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} relative */
function remove(relative) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    return;
  }
  console.log(`rm ${relative}`);
  rmSync(path, { force: true, recursive: true });
}

/** @param {string} parentRelative */
function listDirs(parentRelative) {
  const parent = join(root, parentRelative);
  if (!existsSync(parent)) {
    return [];
  }
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parentRelative, entry.name));
}

/** Workspace package roots: packages/*, tooling/*, projects/*/* */
function workspacePackageDirs() {
  return [
    ...listDirs("packages"),
    ...listDirs("tooling"),
    ...listDirs("projects").flatMap((projectDir) => listDirs(projectDir)),
  ];
}

remove("node_modules");
remove(".turbo");
remove("coverage");
remove(".vercel");

for (const pkg of workspacePackageDirs()) {
  remove(join(pkg, "node_modules"));
  remove(join(pkg, ".turbo"));
  remove(join(pkg, "dist"));
  remove(join(pkg, ".output"));
  remove(join(pkg, ".vercel"));
}

// Generated Paraglide catalogs / inlang caches (any web app under projects/).
for (const projectDir of listDirs("projects")) {
  remove(join(projectDir, "web/src/paraglide"));
  remove(join(projectDir, "web/project.inlang/cache"));
}

console.log("pnpm install");
execSync("pnpm install", { cwd: root, stdio: "inherit" });
