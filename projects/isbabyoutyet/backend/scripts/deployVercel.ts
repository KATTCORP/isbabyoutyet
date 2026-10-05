#!/usr/bin/env tsx
/**
 * Vercel build command (see `web/vercel.json`): deploys the Convex backend and
 * builds the web app against it, following the Convex + Vercel guide:
 * https://docs.convex.dev/production/hosting/vercel
 *
 * `vercel.json` pins `framework: "tanstack-start"` so this monorepo is not
 * treated as Other. The Vercel TanStack Start guide says not to set a build
 * command or output directory; we keep `buildCommand` only so the Convex
 * deploy runs before `vite build`, and omit `outputDirectory` so Nitro can
 * emit the Vercel Build Output API (functions + static).
 * https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
 *
 * 1. Merge-queue refs (`gh-readonly-queue/…`) only build the web app: the
 *    required Vercel check needs nothing more, and a queue-specific backend
 *    would be created and thrown away.
 * 2. `convex deploy` pushes the functions and returns the deployment URL.
 *    A preview deploys with `--preview-name <branch>`, which creates the
 *    branch's backend if it is missing and keeps its data otherwise. Only if
 *    the push is rejected because stored documents don't fit the new schema
 *    is the preview recreated (`--preview-create`, a wipe).
 * 3. Two things then run at once, since neither needs the other:
 *    - the web app is built against that URL;
 *    - the backend is configured: runtime environment variables in one
 *      `convex env set` (stdin, so secrets never reach argv or the build log),
 *      pending migrations, the demo logins on previews, and the homepage demo.
 *      Every step is idempotent, so each deploy runs all of them. A failed
 *      photo upload only warns; the next deploy retries it.
 */
import path from "node:path";
import { NodeRuntime } from "@effect/platform-node";
import {
  ConvexCli,
  ConvexPreviewName,
  deploy,
  previewNameArgs,
  runFunction,
  setEnv,
} from "@workspace/convex-cli";
import { Config, Console, Effect, Option, Schedule, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import {
  MERGE_QUEUE_PLACEHOLDER_CONVEX_URL,
  describeConvexDeployPlan,
  planConvexDeploy,
} from "../src/previewDeploy";
import type { ConvexDeployPlan } from "../src/previewDeploy";
import { homepageDemoSeedLayer, seedHomepageDemo } from "./seedHomepageDemo";

const convexPackageDir = path.resolve(import.meta.dirname, "..");
const webPackageDir = path.resolve(convexPackageDir, "../web");

/** https://vercel.com/docs/environment-variables/system-environment-variables */
const VercelConfig = Config.all({
  branchUrl: Config.NonEmptyString("VERCEL_BRANCH_URL"),
  env: Config.Literals(["production", "preview"], "VERCEL_ENV"),
  gitRef: Config.NonEmptyString("VERCEL_GIT_COMMIT_REF"),
  productionUrl: Config.NonEmptyString("VERCEL_PROJECT_PRODUCTION_URL"),
});

const secret = (name: string) => Config.schema(Schema.Redacted(Schema.NonEmptyString), name);

/** Set on the Convex deployment, where `convex/` reads them through `convexEnv`. */
const ConvexRuntimeConfig = Config.all({
  BETTER_AUTH_SECRET: secret("BETTER_AUTH_SECRET"),
  EMAIL_FROM: Config.NonEmptyString("EMAIL_FROM"),
  RESEND_API_KEY: secret("RESEND_API_KEY"),
  VAPID_PRIVATE_KEY: secret("VAPID_PRIVATE_KEY"),
  VAPID_PUBLIC_KEY: Config.NonEmptyString("VAPID_PUBLIC_KEY"),
  VAPID_SUBJECT: Config.NonEmptyString("VAPID_SUBJECT").pipe(
    Config.withDefault("mailto:admin@isbabyoutyet.com"),
  ),
});

class WebBuildError extends Schema.TaggedError<WebBuildError>()("WebBuildError", {
  exitCode: Schema.Number,
}) {
  override get message() {
    return `The web build exited with code ${this.exitCode}`;
  }
}

class MigrationsFailedError extends Schema.TaggedError<MigrationsFailedError>()(
  "MigrationsFailedError",
  { failed: Schema.Array(Schema.String) },
) {
  override get message() {
    return `Migrations failed: ${this.failed.join("; ")}`;
  }
}

class MigrationsTimeoutError extends Schema.TaggedError<MigrationsTimeoutError>()(
  "MigrationsTimeoutError",
  {},
) {
  override get message() {
    return "Migrations did not finish within five minutes";
  }
}

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

const buildWeb = Effect.fn("buildWeb")(function* (opts: {
  convexUrl: string;
  isPreview: boolean;
  siteUrl: string;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("pnpm", ["run", "build"], {
      cwd: webPackageDir,
      env: {
        VITE_CONVEX_SITE_URL: opts.convexUrl.replace(".convex.cloud", ".convex.site"),
        VITE_CONVEX_URL: opts.convexUrl,
        // Previews are seeded with the demo login, so the login form prefills it.
        VITE_HAS_DEMO_LOGIN: String(opts.isPreview),
        VITE_SITE_URL: opts.siteUrl,
      },
      extendEnv: true,
      stderr: "inherit",
      stdout: "inherit",
    }),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* new WebBuildError({ exitCode });
  }
});

/** `convex run <functionName>` on the `ConvexPreviewName` deployment, echoing what it returns. */
const runAndLog = Effect.fn("runAndLog")(function* (functionName: string) {
  yield* Console.log(`convex run ${functionName}`);
  const convex = yield* ConvexCli;
  const stdout = yield* convex.run(["run", functionName, "{}", ...(yield* previewNameArgs)]);
  if (stdout.trim().length > 0) {
    yield* Console.log(stdout.trim());
  }
});

const MigrationStatus = Schema.Struct({
  failed: Schema.Array(Schema.String),
  isDone: Schema.Boolean,
});

const migrationStatus = runFunction({
  args: {},
  functionName: "migrations:deploymentStatus",
  returns: MigrationStatus,
}).pipe(
  Effect.flatMap((status) =>
    status.failed.length > 0
      ? Effect.fail(new MigrationsFailedError({ failed: status.failed }))
      : Effect.succeed(status),
  ),
);

/** Starts every pending migration, then polls once a second for up to five minutes. */
const runMigrations = Effect.gen(function* () {
  yield* runAndLog("migrations:runAll");
  const status = yield* migrationStatus.pipe(
    Effect.repeat({
      schedule: Schedule.spaced("1 second"),
      times: 299,
      until: (current) => current.isDone,
    }),
  );
  if (!status.isDone) {
    return yield* new MigrationsTimeoutError();
  }
});

const deployBackendAndWeb = Effect.fn("deployBackendAndWeb")(function* (opts: {
  plan: Exclude<ConvexDeployPlan, { kind: "merge-queue" }>;
  siteUrl: string;
}) {
  const plan = opts.plan;
  const isPreview = plan.kind === "preview";
  const runtime = yield* ConvexRuntimeConfig;

  const convexUrl = yield* plan.kind === "preview"
    ? deployPreview(plan.previewName)
    : deployRetryingTimeout({ args: [], retryArgs: [] });

  const configureBackend = Effect.gen(function* () {
    yield* setEnv({
      ...runtime,
      SITE_URL: opts.siteUrl,
      VERCEL_ENV: isPreview ? "preview" : "production",
    });
    yield* runMigrations;
    if (isPreview) {
      yield* runAndLog("seed:seedDemoData");
    }
    yield* seedHomepageDemo({ photos: "best-effort" });
  }).pipe(
    Effect.provideService(
      ConvexPreviewName,
      plan.kind === "preview" ? Option.some(plan.previewName) : Option.none(),
    ),
  );

  yield* Effect.all([buildWeb({ convexUrl, isPreview, siteUrl: opts.siteUrl }), configureBackend], {
    concurrency: "unbounded",
    discard: true,
  });
});

export const deployVercel = Effect.gen(function* () {
  const vercel = yield* VercelConfig;
  const isPreview = vercel.env === "preview";
  const siteUrl = `https://${isPreview ? vercel.branchUrl : vercel.productionUrl}`;

  const plan = planConvexDeploy({ gitRef: vercel.gitRef, vercelEnv: vercel.env });
  yield* Console.log(describeConvexDeployPlan(plan));

  if (plan.kind === "merge-queue") {
    return yield* buildWeb({ convexUrl: MERGE_QUEUE_PLACEHOLDER_CONVEX_URL, isPreview, siteUrl });
  }
  yield* deployBackendAndWeb({ plan, siteUrl });
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  deployVercel.pipe(Effect.provide(homepageDemoSeedLayer), NodeRuntime.runMain);
}
