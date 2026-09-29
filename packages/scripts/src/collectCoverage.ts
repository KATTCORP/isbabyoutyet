import { copyFile, glob, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const outDir = process.argv[2];

if (outDir === undefined) {
  throw new Error("Usage: collect-coverage <out-dir>");
}

const REPORTS = "{projects/*/*,packages/*}/coverage/{coverage-summary.json,lcov.info}";

await rm(outDir, { force: true, recursive: true });

const workspaces = new Set<string>();
for await (const report of glob(REPORTS)) {
  const workspace = dirname(dirname(report));
  const target = join(outDir, workspace);
  await mkdir(target, { recursive: true });
  await copyFile(report, join(target, basename(report)));
  workspaces.add(workspace);
}

for (const workspace of [...workspaces].toSorted()) {
  console.log(`Collected ${workspace}`);
}

if (workspaces.size === 0) {
  throw new Error("No workspace coverage reports found. Run `turbo run test:coverage` first.");
}
