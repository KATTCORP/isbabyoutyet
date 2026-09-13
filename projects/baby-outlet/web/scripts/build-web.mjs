/**
 * Runs the web app build after Convex `start_push` succeeds.
 * `deploy-convex.ts` sets VITE_CONVEX_URL from the URL written by
 * `write-convex-url.mjs` during `convex deploy --cmd`; the
 * .convex.site URL is derived from it.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL is not set (expected to be set by `convex deploy --cmd`)");
}

const workspaceRoot = path.resolve(import.meta.dirname, "../../../..");

const hasDemoLogin =
  process.env.VITE_HAS_DEMO_LOGIN === "true" || process.env.VERCEL_ENV === "preview";

const buildEnv = {
  ...process.env,
  VITE_CONVEX_SITE_URL: convexUrl.replace(".convex.cloud", ".convex.site"),
};
// Preview backends are seeded with DEMO_USER — prefill login forms there.
if (hasDemoLogin) {
  buildEnv.VITE_HAS_DEMO_LOGIN = "true";
}

execFileSync("pnpm", ["turbo", "build", "--filter=@baby-outlet/web"], {
  cwd: workspaceRoot,
  env: buildEnv,
  stdio: "inherit",
});
