// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import type { ConvexCliError } from "@workspace/convex-cli";
import type { ConvexCliCall } from "@workspace/convex-cli/testing";
import { fakeConvexCli } from "@workspace/convex-cli/testing";
import { ConfigProvider, Effect, Fiber, FileSystem, Layer, Result } from "effect";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import { TestClock, TestConsole } from "effect/testing";
import { homepageDemoLocales } from "../src/homepageDemoFeed";
import { configureVercel } from "./configureVercel";

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

type Reply = (call: ConvexCliCall) => Effect.Effect<string, ConvexCliError>;

/** `convex <subcommand>` (`env set`, `run seed:seedDemoData`) → reply. */
const happyReplies = {
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
  return call.args.slice(0, 2).join(" ");
}

function fakeConvex(overrides: Partial<Record<keyof typeof happyReplies, Reply>>) {
  const replies = new Map(Object.entries({ ...happyReplies, ...overrides }));
  const convex = fakeConvexCli((call) => {
    const reply = replies.get(subcommand(call));
    return reply ? reply(call) : Effect.die(`unexpected convex ${call.args.join(" ")}`);
  });
  return { ...convex, subcommands: () => convex.calls.map(subcommand) };
}

function configureWith(services: {
  convex: ReturnType<typeof fakeConvex>;
  env: Record<string, string>;
}) {
  return configureVercel.pipe(
    Effect.provide(
      Layer.mergeAll(
        services.convex.layer,
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.die("unexpected spawn")),
        ),
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

function argvOf(convex: ReturnType<typeof fakeConvex>) {
  return convex.calls.map((call) => call.args.join(" ")).join("\n");
}

describe("configureVercel", () => {
  it.effect("production: sets secrets through stdin only, migrates, and checks the demo", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});

      yield* configureWith({ convex, env: productionEnv });

      expect(convex.subcommands()).toStrictEqual([
        "env set",
        "run migrations:runAll",
        "run migrations:deploymentStatus",
        "run homepageDemo:hasCompletePhotoSet",
      ]);
      const envSet = convex.calls[0];
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

  it.effect("preview: configures the branch's backend and seeds the demo logins", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run homepageDemo:hasCompletePhotoSet": () => Effect.succeed("false"),
      });

      yield* configureWith({ convex, env: previewEnv });

      expect(convex.calls.map((call) => call.args)).toStrictEqual([
        ["env", "set", "--force", "--preview-name", "feat/demo"],
        ["run", "migrations:runAll", "{}", "--preview-name", "feat/demo"],
        ["run", "migrations:deploymentStatus", "{}", "--preview-name", "feat/demo"],
        ["run", "seed:seedDemoData", "{}", "--preview-name", "feat/demo"],
        ["run", "homepageDemo:hasCompletePhotoSet", "{}", "--preview-name", "feat/demo"],
        ["run", "homepageDemo:refreshAll", '{"photos":{}}', "--preview-name", "feat/demo"],
      ]);
      expect(convex.calls[0]?.stdin).toContain(
        "SITE_URL='https://isbabyoutyet-git-feat-demo.vercel.app'",
      );
      expect(convex.calls[0]?.stdin).toContain("VERCEL_ENV='preview'");
    }),
  );

  it.effect("a failed photo upload only warns: the text is seeded and the task succeeds", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run homepageDemo:hasCompletePhotoSet": () => Effect.succeed("false"),
      });

      yield* configureWith({ convex, env: productionEnv });

      expect(convex.subcommands().slice(-2)).toStrictEqual([
        "run homepageDemo:hasCompletePhotoSet",
        "run homepageDemo:refreshAll",
      ]);
      expect(yield* TestConsole.errorLines).toStrictEqual([
        expect.stringContaining("Homepage demo photos were not stored"),
      ]);
    }),
  );

  it.effect("merge queue: there is no backend to configure", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});

      yield* configureWith({
        convex,
        env: { ...previewEnv, VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-280-0a1b2c3d" },
      });

      expect(convex.calls).toStrictEqual([]);
    }),
  );

  it.effect("fails before touching Convex when a secret is missing", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({});
      const env = Object.fromEntries(
        Object.entries(productionEnv).filter(([name]) => name !== "RESEND_API_KEY"),
      );

      const result = yield* Effect.result(configureWith({ convex, env }));

      expect(Result.isFailure(result)).toBe(true);
      expect(convex.calls).toStrictEqual([]);
    }),
  );

  it.effect("fails when a migration fails", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run migrations:deploymentStatus": () =>
          Effect.succeed('{"failed":["backfillTheme: boom"],"isDone":false}'),
      });

      const error = yield* configureWith({ convex, env: productionEnv }).pipe(Effect.flip);

      expect(error.message).toBe("Migrations failed: backfillTheme: boom");
      expect(convex.subcommands()).not.toContain("run homepageDemo:hasCompletePhotoSet");
    }),
  );

  it.effect("polls migrations once a second and gives up after five minutes", () =>
    Effect.gen(function* () {
      const convex = fakeConvex({
        "run migrations:deploymentStatus": () => Effect.succeed('{"failed":[],"isDone":false}'),
      });

      const fiber = yield* configureWith({ convex, env: productionEnv }).pipe(
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
