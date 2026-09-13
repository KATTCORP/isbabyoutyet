#!/usr/bin/env tsx
/**
 * Vercel build command (see vercel.json): deploys the Convex backend and
 * builds the web app, following the canonical Convex + Vercel setup:
 * https://docs.convex.dev/production/hosting/vercel
 *
 * 1. `convex deploy` pushes functions and runs the web build via `--cmd`,
 *    with the deployment URL exposed as VITE_CONVEX_URL. On Vercel it
 *    automatically targets production or a per-branch preview deployment
 *    based on the CONVEX_DEPLOY_KEY. `--preview-create` recreates the
 *    branch's preview backend from scratch on every deploy so previews
 *    never fail schema validation against stale data from an earlier
 *    schema, and `--preview-run` reseeds the fresh backend with the demo
 *    login + babies (both flags are ignored in production).
 * 2. Runtime environment variables are synced to the Convex deployment.
 *    Tip: most of these can instead be configured once as project "default
 *    environment variables" in the Convex dashboard; SITE_URL is the only
 *    per-preview value.
 * 3. Pending migrations are run.
 * 4. The public homepage demo baby is refreshed (dates shifted to now,
 *    visitor comments wiped, fixture photos/feed restored). Runs in every
 *    environment, including production.
 */
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { convexEnvSchema } from "@baby-outlet/backend/src/env";
import * as z from "zod";

const vercelEnvSchema = z.object({
  VERCEL_ENV: z.enum(["production", "preview"]),
  VERCEL_GIT_COMMIT_REF: z.string().min(1), // The git branch of the commit
  VERCEL_BRANCH_URL: z.string().min(1), // The domain name of the Git branch URL
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1), // The domain name of the production project URL

  BETTER_AUTH_SECRET: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().optional().default("mailto:admin@isbabyoutyet.com"),
});

const env = vercelEnvSchema.parse(process.env);
const isPreview = env.VERCEL_ENV === "preview";

const siteUrl = isPreview
  ? `https://${env.VERCEL_BRANCH_URL}`
  : `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;

const convexEnv = convexEnvSchema.parse({ ...env, SITE_URL: siteUrl });

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const convexPackageDir = path.resolve(scriptsDir, "../../backend");

function convexCli(args: string[]) {
  console.log(`\n$ convex ${args.join(" ")}`);
  execFileSync("pnpm", ["convex", ...args], {
    cwd: convexPackageDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SITE_URL: siteUrl,
      // Bake demo-login prefills into the web build on preview only.
      ...(isPreview ? { VITE_HAS_DEMO_LOGIN: "true" } : {}),
    },
  });
}

function convexCliOutput(args: string[]) {
  console.log(`\n$ convex ${args.join(" ")}`);
  return execFileSync("pnpm", ["convex", ...args], {
    cwd: convexPackageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      VITE_SITE_URL: siteUrl,
      ...(isPreview ? { VITE_HAS_DEMO_LOGIN: "true" } : {}),
    },
  });
}

convexCli([
  "deploy",
  "--cmd-url-env-var-name",
  "VITE_CONVEX_URL",
  "--cmd",
  "node ../web/scripts/build-web.mjs",
  ...(isPreview
    ? ["--preview-create", env.VERCEL_GIT_COMMIT_REF, "--preview-run", "seed:seedDemoData"]
    : []),
]);

// `convex deploy` infers the preview name from the git branch; the other
// commands need it passed explicitly.
const previewArgs = isPreview ? ["--preview-name", env.VERCEL_GIT_COMMIT_REF] : [];

for (const [key, value] of Object.entries(convexEnv)) {
  convexCli(["env", "set", key, value, ...previewArgs]);
}

convexCli(["run", "migrations:runAll", ...previewArgs]);

const migrationStatusSchema = z.object({
  isDone: z.boolean(),
  failed: z.array(z.string()),
});

for (let attempt = 0; attempt < 300; attempt += 1) {
  const status = migrationStatusSchema.parse(
    JSON.parse(convexCliOutput(["run", "migrations:deploymentStatus", ...previewArgs])),
  );
  if (status.failed.length > 0) {
    throw new Error(`Migration failed: ${status.failed.join("; ")}`);
  }
  if (status.isDone) {
    break;
  }
  if (attempt === 299) {
    throw new Error("Migrations did not finish before the deployment deadline");
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.log("\n$ pnpm seed:homepage");
execFileSync("pnpm", ["run", "seed:homepage", "--", ...previewArgs], {
  cwd: convexPackageDir,
  stdio: "inherit",
  env: process.env,
});
