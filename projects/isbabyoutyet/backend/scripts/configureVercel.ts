#!/usr/bin/env tsx
/**
 * `configure:vercel`: runs on Vercel once `deploy:vercel` has pushed the
 * backend, while the web app builds. It sets the runtime environment
 * variables in one `convex env set` (stdin, so secrets never reach argv or
 * the build log), runs pending migrations, and seeds the demo logins on
 * previews and the homepage demo everywhere. Every step is idempotent, so
 * each deploy runs all of them. A failed photo upload only warns; the next
 * deploy retries it. Merge-queue builds have no backend, so there is nothing
 * to configure.
 */
import path from "node:path";
import { NodeRuntime } from "@effect/platform-node";
import {
  ConvexCli,
  ConvexPreviewName,
  previewNameArgs,
  runFunction,
  setEnv,
} from "@workspace/convex-cli";
import { Console, Effect, Option, Schedule, Schema } from "effect";
import { homepageDemoSeedLayer, seedHomepageDemo } from "./seedHomepageDemo";
import { ConvexRuntimeConfig, vercelDeployment } from "./vercelEnv";

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

export const configureVercel = Effect.gen(function* () {
  const deployment = yield* vercelDeployment;
  const plan = deployment.plan;
  if (plan.kind === "merge-queue") {
    return yield* Console.log("GitHub merge queue — no Convex backend to configure");
  }
  const runtime = yield* ConvexRuntimeConfig;

  yield* Effect.gen(function* () {
    yield* setEnv({
      ...runtime,
      SITE_URL: deployment.siteUrl,
      VERCEL_ENV: deployment.isPreview ? "preview" : "production",
    });
    yield* runMigrations;
    if (deployment.isPreview) {
      yield* runAndLog("seed:seedDemoData");
    }
    yield* seedHomepageDemo({ photos: "best-effort" });
  }).pipe(
    Effect.provideService(
      ConvexPreviewName,
      plan.kind === "preview" ? Option.some(plan.previewName) : Option.none(),
    ),
  );
});

const isCli = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isCli) {
  configureVercel.pipe(Effect.provide(homepageDemoSeedLayer), NodeRuntime.runMain);
}
