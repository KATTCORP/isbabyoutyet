// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import { ConvexCliError, ConvexSchemaValidationError } from "@workspace/convex-cli";
import type { ConvexCliCall } from "@workspace/convex-cli/testing";
import { fakeConvexCli } from "@workspace/convex-cli/testing";
import {
  ConfigProvider,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Result,
  Sink,
  Stream,
} from "effect";
import { HttpClient } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { TestClock, TestConsole } from "effect/testing";
import { homepageDemoLocales } from "../src/homepageDemoFeed";
import { MERGE_QUEUE_PLACEHOLDER_CONVEX_URL } from "../src/previewDeploy";
import { deployVercel } from "./deployVercel";

const CONVEX_URL = "https://happy-otter-123.convex.cloud";

const SECRETS = {
  BETTER_AUTH_SECRET: "auth-secret-value",
  RESEND_API_KEY: "resend-secret-value",
  VAPID_PRIVATE_KEY: "vapid-secret-value",
};

const productionEnv = {
  ...SECRETS,
  EMAIL_FROM: "Baby <hello@isbabyoutyet.com>",
  VAPID_PUBLIC_KEY: "vapid-public",
  VERCEL_BRANCH_URL: "isbabyoutyet-git-main.vercel.app",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  VERCEL_PROJECT_PRODUCTION_URL: "isbabyoutyet.com",
};

const previewEnv = {
  ...productionEnv,
  VERCEL_BRANCH_URL: "isbabyoutyet-git-feat-demo.vercel.app",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "feat/demo",
};

function cliFailure(stderr: string) {
  return new ConvexCliError({ command: "deploy", exitCode: 1, stderr, stdout: "" });
}

const START_PUSH_408 = cliFailure(
  "✖ Error fetching POST  https://happy-otter-123.convex.cloud/api/deploy2/start_push 408 Request Timeout",
);

const SCHEMA_REJECTED = cliFailure(
  '✖ Schema validation failed.\nDocument with ID "j57…" in table "baby" does not match the schema',
);

type Reply = (call: ConvexCliCall) => Effect.Effect<string, ConvexCliError>;

/** `convex <subcommand>` (`deploy`, `env set`, `run seed:seedDemoData`) → reply. */
const happyReplies = {
  deploy: () => Effect.succeed(`${CONVEX_URL}\n`),
  "env set": () => Effect.succeed(""),
  "run homepageDemo:hasCompletePhotoSet": () => Effect.succeed("true"),
  "run homepageDemo:refreshAll": () =>
    Effect.succeed(
      JSON.stringify(
        homepageDemoLocales().map((locale) => ({ babyId: "baby", locale, publicId: locale })),
      ),
    ),
  "run migrations:deploymentStatus": () => Effect.succeed('{"failed":[],"isDone":true}'),
  "run migrations:runAll": () => Effect.succeed('{"status":"done"}'),
  "run seed:seedDemoData": () => Effect.succeed(""),
} satisfies Record<string, Reply>;

function subcommand(call: ConvexCliCall) {
  return call.args[0] === "deploy" ? "deploy" : call.args.slice(0, 2).join(" ");
}

function fakeConvex(overrides: Partial<Record<keyof typeof happyReplies, Reply>>) {
  const replies = new Map(Object.entries({ ...happyReplies, ...overrides }));
  const convex = fakeConvexCli((call) => {
    const reply = replies.get(subcommand(call));
    return reply ? reply(call) : Effect.die(`unexpected convex ${call.args.join(" ")}`);
  });
  return { ...convex, subcommands: () => convex.calls.map(subcommand) };
}

/** Records every spawned command; each one exits with what `exit` returns. */
function fakeSpawner(exit: Effect.Effect<number> = Effect.succeed(0)) {
  const commands: Array<ChildProcess.StandardCommand> = [];
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        if (ChildProcess.isStandardCommand(command)) {
          commands.push(command);
        }
        return ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.map(exit, ChildProcessSpawner.ExitCode),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  return { commands, layer };
}

function deployWith(services: {
  convex: ReturnType<typeof fakeConvex>;
  env: Record<string, string>;
  spawner: ReturnType<typeof fakeSpawner>;
}) {
  return deployVercel.pipe(
    Effect.provide(
      Layer.mergeAll(
        services.convex.layer,
        services.spawner.layer,
        // Photo reads fail, so a seed that needs photos takes its best-effort path.
        FileSystem.layerNoop({}),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die("unexpected upload")),
        ),
        ConfigProvider.layer(ConfigProvider.fromUnknown(services.env)),
      ),
    ),
  );
}

function webBuildEnv(spawner: ReturnType<typeof fakeSpawner>) {
  expect(spawner.commands.map((command) => [command.command, ...command.args])).toStrictEqual([
    ["pnpm", "run", "build"],
  ]);
  expect(spawner.commands[0]?.options.cwd).toMatch(/projects\/isbabyoutyet\/web$/);
  return spawner.commands[0]?.options.env;
}

/** The flags each `convex deploy` got after the `--cmd` that prints the URL. */
function deployFlags(convex: ReturnType<typeof fakeConvex>) {
  return convex.calls.filter((call) => call.args[0] === "deploy").map((call) => call.args.slice(5));
}

function argvOf(convex: ReturnType<typeof fakeConvex>) {
  return convex.calls.map((call) => call.args.join(" ")).join("\n");
}

describe("deployVercel", () => {
  it.effect("production: deploys, builds, and sets secrets through stdin only", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});
      const spawner = fakeSpawner();

      yield* deployWith({ convex, env: productionEnv, spawner });

      expect(convex.subcommands()).toStrictEqual([
        "deploy",
        "env set",
        "run migrations:runAll",
        "run migrations:deploymentStatus",
        "run homepageDemo:hasCompletePhotoSet",
      ]);
      expect(convex.calls[0]?.args.slice(4)).toStrictEqual(["printenv CONVEX_DEPLOY_URL"]);
      expect(webBuildEnv(spawner)).toStrictEqual({
        VITE_CONVEX_SITE_URL: "https://happy-otter-123.convex.site",
        VITE_CONVEX_URL: CONVEX_URL,
        VITE_HAS_DEMO_LOGIN: "false",
        VITE_SITE_URL: "https://isbabyoutyet.com",
      });

      const envSet = convex.calls[1];
      expect(envSet?.args).toStrictEqual(["env", "set", "--force"]);
      for (const value of Object.values(SECRETS)) {
        expect(envSet?.stdin).toContain(value);
        expect(argvOf(convex)).not.toContain(value);
      }
      expect(envSet?.stdin).toContain("SITE_URL='https://isbabyoutyet.com'");
      expect(envSet?.stdin).toContain("VERCEL_ENV='production'");
      expect(envSet?.stdin).toContain("VAPID_SUBJECT='mailto:admin@isbabyoutyet.com'");
    }),
  );

  it.effect("new preview: retries a start_push 408 without a wipe, then seeds it", () =>
    Effect.gen(function* () {
      let deploys = 0;
      const convex = fakeConvex({
        deploy: () => (deploys++ === 0 ? Effect.fail(START_PUSH_408) : Effect.succeed(CONVEX_URL)),
        "run homepageDemo:hasCompletePhotoSet": () => Effect.succeed("false"),
      });
      const spawner = fakeSpawner();

      yield* deployWith({ convex, env: previewEnv, spawner });

      expect(convex.calls.map((call) => call.args)).toStrictEqual([
        expect.arrayContaining(["deploy", "--preview-name", "feat/demo"]),
        expect.arrayContaining(["deploy", "--preview-name", "feat/demo"]),
        ["env", "set", "--force", "--preview-name", "feat/demo"],
        ["run", "migrations:runAll", "{}", "--preview-name", "feat/demo"],
        ["run", "migrations:deploymentStatus", "{}", "--preview-name", "feat/demo"],
        ["run", "seed:seedDemoData", "{}", "--preview-name", "feat/demo"],
        ["run", "homepageDemo:hasCompletePhotoSet", "{}", "--preview-name", "feat/demo"],
        ["run", "homepageDemo:refreshAll", '{"photos":{}}', "--preview-name", "feat/demo"],
      ]);
      expect(convex.calls[2]?.stdin).toContain(
        "SITE_URL='https://isbabyoutyet-git-feat-demo.vercel.app'",
      );
      expect(webBuildEnv(spawner)).toMatchObject({ VITE_HAS_DEMO_LOGIN: "true" });
    }),
  );

  it.effect("existing preview: keeps its data and re-runs every idempotent step", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});

      yield* deployWith({ convex, env: previewEnv, spawner: fakeSpawner() });

      expect(convex.subcommands()).toStrictEqual([
        "deploy",
        "env set",
        "run migrations:runAll",
        "run migrations:deploymentStatus",
        "run seed:seedDemoData",
        "run homepageDemo:hasCompletePhotoSet",
      ]);
      expect(deployFlags(convex)).toStrictEqual([["--preview-name", "feat/demo"]]);
    }),
  );

  it.effect("a failed photo upload only warns: the text is seeded and the build succeeds", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run homepageDemo:hasCompletePhotoSet": () => Effect.succeed("false"),
      });

      yield* deployWith({ convex, env: productionEnv, spawner: fakeSpawner() });

      expect(convex.subcommands().slice(-2)).toStrictEqual([
        "run homepageDemo:hasCompletePhotoSet",
        "run homepageDemo:refreshAll",
      ]);
      expect(yield* TestConsole.errorLines).toStrictEqual([
        expect.stringContaining("Homepage demo photos were not stored"),
      ]);
    }),
  );

  it.effect("builds the web app while it configures and seeds the backend", () =>
    Effect.gen(function* () {
      const seeded = yield* Deferred.make<void>();
      const convex = fakeConvex({
        "run homepageDemo:hasCompletePhotoSet": () =>
          Deferred.succeed(seeded, undefined).pipe(Effect.as("true")),
      });
      // The web build only exits once the seed has started, so running the two in sequence would hang.
      const spawner = fakeSpawner(Deferred.await(seeded).pipe(Effect.as(0)));

      yield* deployWith({ convex, env: productionEnv, spawner });

      expect(spawner.commands).toHaveLength(1);
    }),
  );

  it.effect("rejected schema: recreates the preview, then seeds it", () =>
    Effect.gen(function* () {
      let deploys = 0;
      const convex = fakeConvex({
        deploy: () =>
          deploys++ === 0 ? Effect.fail(SCHEMA_REJECTED) : Effect.succeed(`${CONVEX_URL}\n`),
      });

      yield* deployWith({ convex, env: previewEnv, spawner: fakeSpawner() });

      expect(deployFlags(convex)).toStrictEqual([
        ["--preview-name", "feat/demo"],
        ["--preview-create", "feat/demo"],
      ]);
      expect(convex.subcommands()).toContain("run seed:seedDemoData");
    }),
  );

  it.effect("a recreated preview that times out is retried without a second wipe", () =>
    Effect.gen(function* () {
      const replies = [Effect.fail(SCHEMA_REJECTED), Effect.fail(START_PUSH_408)];
      const convex = fakeConvex({
        deploy: () => replies.shift() ?? Effect.succeed(`${CONVEX_URL}\n`),
      });

      yield* deployWith({ convex, env: previewEnv, spawner: fakeSpawner() });

      expect(deployFlags(convex)).toStrictEqual([
        ["--preview-name", "feat/demo"],
        ["--preview-create", "feat/demo"],
        ["--preview-name", "feat/demo"],
      ]);
    }),
  );

  it.effect("production never wipes: a rejected schema fails the build", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({ deploy: () => Effect.fail(SCHEMA_REJECTED) });

      const error = yield* deployWith({ convex, env: productionEnv, spawner: fakeSpawner() }).pipe(
        Effect.flip,
      );

      expect(error).toStrictEqual(new ConvexSchemaValidationError());
      expect(deployFlags(convex)).toStrictEqual([[]]);
    }),
  );

  it.effect("merge queue: builds the web app against the placeholder without touching Convex", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});
      const spawner = fakeSpawner();

      yield* deployWith({
        convex,
        env: { ...previewEnv, VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-280-0a1b2c3d" },
        spawner,
      });

      expect(convex.calls).toStrictEqual([]);
      expect(webBuildEnv(spawner)).toMatchObject({
        VITE_CONVEX_URL: MERGE_QUEUE_PLACEHOLDER_CONVEX_URL,
      });
    }),
  );

  it.effect("fails before deploying when a secret is missing", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});
      const env = Object.fromEntries(
        Object.entries(productionEnv).filter(([name]) => name !== "RESEND_API_KEY"),
      );

      const result = yield* Effect.result(deployWith({ convex, env, spawner: fakeSpawner() }));

      expect(Result.isFailure(result)).toBe(true);
      expect(convex.calls).toStrictEqual([]);
    }),
  );

  it.effect("fails the build when the web build fails", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});

      const error = yield* deployWith({
        convex,
        env: productionEnv,
        spawner: fakeSpawner(Effect.succeed(1)),
      }).pipe(Effect.flip);

      expect(error.message).toBe("The web build exited with code 1");
      expect(convex.subcommands()).toStrictEqual(["deploy"]);
    }),
  );

  it.effect("fails when a migration fails", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run migrations:deploymentStatus": () =>
          Effect.succeed('{"failed":["backfillTheme: boom"],"isDone":false}'),
      });

      const error = yield* deployWith({ convex, env: productionEnv, spawner: fakeSpawner() }).pipe(
        Effect.flip,
      );

      expect(error.message).toBe("Migrations failed: backfillTheme: boom");
      expect(convex.subcommands()).not.toContain("run homepageDemo:hasCompletePhotoSet");
    }),
  );

  it.effect("polls migrations once a second and gives up after five minutes", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run migrations:deploymentStatus": () => Effect.succeed('{"failed":[],"isDone":false}'),
      });

      const fiber = yield* deployWith({ convex, env: productionEnv, spawner: fakeSpawner() }).pipe(
        Effect.flip,
        Effect.forkChild,
      );
      yield* TestClock.adjust("5 minutes");
      const error = yield* Fiber.join(fiber);

      expect(error.message).toBe("Migrations did not finish within five minutes");
      expect(
        convex.subcommands().filter((name) => name === "run migrations:deploymentStatus"),
      ).toHaveLength(300);
    }),
  );
});
