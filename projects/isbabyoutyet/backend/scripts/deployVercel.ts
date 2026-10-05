#!/usr/bin/env tsx
/**
 * `deploy:vercel`, the first task of the Vercel build (see `web/vercel.json`
 * and the `*:vercel` tasks in `turbo.json`). It pushes the Convex backend,
 * following the Convex + Vercel guide, and hands the deployment URL to the
 * web build: https://docs.convex.dev/production/hosting/vercel
 *
 * `vercel.json` pins `framework: "tanstack-start"` so this monorepo is not
 * treated as Other. The Vercel TanStack Start guide says not to set a build
 * command or output directory; we keep `buildCommand` only so the Convex
 * deploy runs before `vite build`, and omit `outputDirectory` so Nitro can
 * emit the Vercel Build Output API (functions + static).
 * https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
 *
 * 1. Merge-queue refs (`gh-readonly-queue/…`) skip the push: the required
 *    Vercel check only needs the web build, and a queue-specific backend
 *    would be created and thrown away. The web app builds against a
 *    placeholder URL.
 * 2. `convex deploy` pushes the functions and returns the deployment URL.
 *    A preview deploys with `--preview-name <branch>`, which creates the
 *    branch's backend if it is missing and keeps its data otherwise. Only if
 *    the push is rejected because stored documents don't fit the new schema
 *    is the preview recreated (`--preview-create`, a wipe).
 * 3. The URL goes to `web/.env.production.local`, which `vite build` loads.
 *    Turbo hashes a task's files before its dependencies run, so the web
 *    build must never be restored from cache: `build:vercel` is uncached.
 *
 * Turbo then runs `build:vercel` (the web app) and `configure:vercel`
 * (`configureVercel.ts`) side by side.
 */
import path from "node:path";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ConvexCli, deploy } from "@workspace/convex-cli";
import { Console, Effect, FileSystem, Layer, Match } from "effect";
import { MERGE_QUEUE_PLACEHOLDER_CONVEX_URL, describeConvexDeployPlan } from "../src/previewDeploy";
import { ConvexRuntimeConfig, vercelDeployment } from "./vercelEnv";

const convexPackageDir = path.resolve(import.meta.dirname, "..");

/** @internal Exported for tests. */
export const webEnvFile = path.resolve(convexPackageDir, "../web/.env.production.local");

/**
 * A fresh deployment can answer `start_push` with a 408. It is claimed by
 * then, so `retryArgs` must target it without wiping it again.
 */
function deployRetryingTimeout(opts: {
  args: ReadonlyArray<string>;
  retryArgs: ReadonlyArray<string>;
}) {
  return deploy(opts.args).pipe(
    Effect.catchTag("ConvexPushTimeoutError", (timeout) =>
      Console.log(`${timeout.message} — retrying without a wipe`).pipe(
        Effect.andThen(deploy(opts.retryArgs)),
      ),
    ),
  );
}

function deployPreview(previewName: string) {
  const reuse = ["--preview-name", previewName];
  return deployRetryingTimeout({ args: reuse, retryArgs: reuse }).pipe(
    Effect.catchTag("ConvexSchemaValidationError", (rejected) =>
      Console.log(`${rejected.message} — recreating Convex preview "${previewName}"`).pipe(
        Effect.andThen(
          deployRetryingTimeout({ args: ["--preview-create", previewName], retryArgs: reuse }),
        ),
      ),
    ),
  );
}

const writeWebEnv = Effect.fn("writeWebEnv")(function* (opts: {
  convexUrl: string;
  isPreview: boolean;
  siteUrl: string;
}) {
  const env = {
    VITE_CONVEX_SITE_URL: opts.convexUrl.replace(".convex.cloud", ".convex.site"),
    VITE_CONVEX_URL: opts.convexUrl,
    // Previews are seeded with the demo login, so the login form prefills it.
    VITE_HAS_DEMO_LOGIN: String(opts.isPreview),
    VITE_SITE_URL: opts.siteUrl,
  };
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(
    webEnvFile,
    Object.entries(env)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );
  yield* Console.log(`Wrote the web build's Convex URL (${opts.convexUrl}) to ${webEnvFile}`);
});

export const deployVercel = Effect.gen(function* () {
  const deployment = yield* vercelDeployment;
  const plan = deployment.plan;
  yield* Console.log(describeConvexDeployPlan(plan));

  if (plan.kind !== "merge-queue") {
    // `configure:vercel` needs these; fail before pushing anything if one is missing.
    yield* ConvexRuntimeConfig;
  }
  const convexUrl = yield* Match.value(plan).pipe(
    Match.discriminatorsExhaustive("kind")({
      "merge-queue": () => Effect.succeed(MERGE_QUEUE_PLACEHOLDER_CONVEX_URL),
      preview: (preview) => deployPreview(preview.previewName),
      production: () => deployRetryingTimeout({ args: [], retryArgs: [] }),
    }),
  );

  yield* writeWebEnv({ convexUrl, isPreview: deployment.isPreview, siteUrl: deployment.siteUrl });
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  deployVercel.pipe(
    Effect.provide(
      ConvexCli.layer({ cwd: convexPackageDir }).pipe(Layer.provideMerge(NodeServices.layer)),
    ),
    NodeRuntime.runMain,
  );
}
