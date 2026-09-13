import { execFileSync } from "node:child_process";
import path from "node:path";
import webPush from "web-push";
import {
  parseConvexEnvList,
  staticLocalConvexEnvUpdates,
  vapidKeysAreSet,
} from "../src/localDevEnv";

const convexPackageDir = path.resolve(import.meta.dirname, "..");

function convexEnvCli(args: Array<string>) {
  return execFileSync("pnpm", ["convex", "env", ...args], {
    cwd: convexPackageDir,
    encoding: "utf8",
    env: process.env,
  });
}

function setConvexEnv(key: string, value: string) {
  console.log(`convex env set ${key}`);
  convexEnvCli(["set", key, value]);
}

export function ensureLocalConvexEnv() {
  const existing = parseConvexEnvList(convexEnvCli(["list"]));
  const updates = staticLocalConvexEnvUpdates(existing);

  if (!vapidKeysAreSet(existing)) {
    const vapid = webPush.generateVAPIDKeys();
    updates.VAPID_PUBLIC_KEY = vapid.publicKey;
    updates.VAPID_PRIVATE_KEY = vapid.privateKey;
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) {
    console.log("Convex env already has the required local values.");
    return;
  }

  for (const key of keys) {
    const value = updates[key];
    if (value === undefined) {
      continue;
    }
    setConvexEnv(key, value);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  ensureLocalConvexEnv();
}
