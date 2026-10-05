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
 * `planConvexDeploy` decides what to do; this program runs it:
 *
 * 1. Merge-queue refs (`gh-readonly-queue/…`) only build the web app: the
 *    required Vercel check needs nothing more, and a queue-specific backend
 *    would be created and thrown away.
 * 2. `convex deploy` pushes the functions and returns the deployment URL. A
 *    fresh preview can answer `start_push` with a 408; the preview is claimed
 *    by then, so the retry reuses it instead of wiping it again.
 * 3. The web app is built against that URL.
 * 4. Runtime environment variables are set in one `convex env set` (stdin, so
 *    secrets never reach argv or the build log).
 * 5. Pending migrations run, and the build waits for them.
 * 6. New previews get the demo login; then the homepage demo is seeded.
 */
import path from "node:path";
import { NodeRuntime } from "@effect/platform-node";
import {
  ConvexCli,
  ConvexPreviewName,
  deploy,
  listEnv,
  previewNameArgs,
  runFunction,
  setEnv,
} from "@workspace/convex-cli";
import type { ConvexEnvVars } from "@workspace/convex-cli";
import { Config, Console, Effect, FileSystem, Option, Schedule, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import {
  MERGE_QUEUE_PLACEHOLDER_CONVEX_URL,
  SCHEMA_FINGERPRINT_ENV,
  SCHEMA_FINGERPRINT_RELATIVE_PATHS,
  computeSchemaFingerprint,
  convexDeployCliArgs,
  convexDeployRetryCliArgs,
  convexPostPushRunFunctions,
  describeConvexDeployPlan,
  planConvexDeploy,
  planPreviewName,
  shouldPushConvexBackend,
} from "../src/previewDeploy";
import type { ConvexDeployPlan } from "../src/previewDeploy";
import {
  homepageDemoSeedLayer,
  seedHomepageDemo,
  seedHomepageDemoContent,
} from "./seedHomepageDemo";

const convexPackageDir = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(convexPackageDir, "../../..");

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

const readCurrentFingerprint = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* Effect.forEach(SCHEMA_FINGERPRINT_RELATIVE_PATHS, (relativePath) =>
    fs
      .readFileString(path.join(convexPackageDir, relativePath))
      .pipe(Effect.map((contents) => ({ contents, path: relativePath }))),
  );
  return computeSchemaFingerprint(files);
});

/** `env list` fails when the preview does not exist yet. */
const readStoredFingerprint = (previewName: string) =>
  listEnv.pipe(
    Effect.map((env) => ({
      fingerprint: env[SCHEMA_FINGERPRINT_ENV] ?? null,
      previewExists: true,
    })),
    Effect.catchTag("ConvexCliError", () =>
      Effect.succeed({ fingerprint: null, previewExists: false }),
    ),
    Effect.provideService(ConvexPreviewName, Option.some(previewName)),
  );

const buildWeb = Effect.fn("buildWeb")(function* (opts: {
  convexUrl: string;
  isPreview: boolean;
  siteUrl: string;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make("pnpm", ["turbo", "build", "--filter=@isbabyoutyet/web"], {
      cwd: workspaceRoot,
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

const seeds = { all: seedHomepageDemo, content: seedHomepageDemoContent };

const pushAndSeed = Effect.fn("pushAndSeed")(function* (opts: {
  currentFingerprint: string;
  isPreview: boolean;
  plan: Exclude<ConvexDeployPlan, { kind: "merge-queue-web-only" }>;
  siteUrl: string;
  vercelEnv: "production" | "preview";
}) {
  const plan = opts.plan;
  const runtime = yield* ConvexRuntimeConfig;

  const convexUrl = yield* deploy(convexDeployCliArgs(plan)).pipe(
    Effect.catchTag("ConvexPushTimeoutError", (timeout) =>
      Console.log(`${timeout.message} — retrying without a wipe`).pipe(
        Effect.andThen(deploy(convexDeployRetryCliArgs(plan))),
      ),
    ),
  );

  yield* buildWeb({ convexUrl, isPreview: opts.isPreview, siteUrl: opts.siteUrl });

  yield* Effect.gen(function* () {
    if (plan.writeEnv) {
      const vars: ConvexEnvVars = {
        ...runtime,
        SITE_URL: opts.siteUrl,
        VERCEL_ENV: opts.vercelEnv,
      };
      if (plan.kind !== "production") {
        vars[SCHEMA_FINGERPRINT_ENV] = opts.currentFingerprint;
      }
      yield* setEnv(vars);
    } else {
      yield* Console.log("Convex env already set on this preview — skipping env sync");
    }

    yield* runMigrations;

    for (const functionName of convexPostPushRunFunctions(plan)) {
      yield* runAndLog(functionName);
    }
    if (plan.seed !== null) {
      yield* seeds[plan.seed];
    }
  }).pipe(Effect.provideService(ConvexPreviewName, Option.fromNullOr(planPreviewName(plan))));
});

export const deployVercel = Effect.gen(function* () {
  const vercel = yield* VercelConfig;
  const isPreview = vercel.env === "preview";
  const siteUrl = `https://${isPreview ? vercel.branchUrl : vercel.productionUrl}`;

  const pushConvex = shouldPushConvexBackend(vercel.gitRef);
  const currentFingerprint = pushConvex ? yield* readCurrentFingerprint : "";
  const stored =
    isPreview && pushConvex
      ? yield* readStoredFingerprint(vercel.gitRef)
      : { fingerprint: null, previewExists: false };
  const plan = planConvexDeploy({
    currentFingerprint,
    gitRef: vercel.gitRef,
    stored,
    vercelEnv: vercel.env,
  });
  yield* Console.log(describeConvexDeployPlan(plan));

  if (plan.kind === "merge-queue-web-only") {
    return yield* buildWeb({ convexUrl: MERGE_QUEUE_PLACEHOLDER_CONVEX_URL, isPreview, siteUrl });
  }
  yield* pushAndSeed({ currentFingerprint, isPreview, plan, siteUrl, vercelEnv: vercel.env });
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  deployVercel.pipe(Effect.provide(homepageDemoSeedLayer), NodeRuntime.runMain);
}
