// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import { ConvexCliError, ConvexSchemaValidationError } from "@workspace/convex-cli";
import type { ConvexCliCall } from "@workspace/convex-cli/testing";
import { fakeConvexCli } from "@workspace/convex-cli/testing";
import { ConfigProvider, Effect, FileSystem, Layer, Result } from "effect";
import { MERGE_QUEUE_PLACEHOLDER_CONVEX_URL } from "../src/previewDeploy";
import { deployVercel, webEnvFile } from "./deployVercel";

const CONVEX_URL = "https://happy-otter-123.convex.cloud";

const productionEnv = {
  BETTER_AUTH_SECRET: "auth-secret-value",
  EMAIL_FROM: "Baby <hello@isbabyoutyet.com>",
  RESEND_API_KEY: "resend-secret-value",
  VAPID_PRIVATE_KEY: "vapid-secret-value",
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

/** Answers every `convex deploy` with `deploy()`; any other subcommand is a bug. */
function fakeConvex(deploy: () => Effect.Effect<string, ConvexCliError>) {
  return fakeConvexCli((call: ConvexCliCall) =>
    call.args[0] === "deploy" ? deploy() : Effect.die(`unexpected convex ${call.args.join(" ")}`),
  );
}

function deployWith(services: {
  convex: ReturnType<typeof fakeConvex>;
  env: Record<string, string>;
}) {
  const written = new Map<string, string>();
  const run = deployVercel.pipe(
    Effect.provide(
      Layer.mergeAll(
        services.convex.layer,
        FileSystem.layerNoop({
          writeFileString: (path, data) => Effect.sync(() => void written.set(path, data)),
        }),
        ConfigProvider.layer(ConfigProvider.fromUnknown(services.env)),
      ),
    ),
  );
  return { run, written };
}

/** The flags each `convex deploy` got after the `--cmd` that prints the URL. */
function deployFlags(convex: ReturnType<typeof fakeConvex>) {
  return convex.calls.map((call) => call.args.slice(5));
}

describe("deployVercel", () => {
  it.effect("production: deploys and hands the URL to the web build", () =>
    Effect.gen(function* () {
      const convex = fakeConvex(() => Effect.succeed(`${CONVEX_URL}\n`));
      const deploy = deployWith({ convex, env: productionEnv });

      yield* deploy.run;

      expect(convex.calls[0]?.args.slice(4)).toStrictEqual(["printenv CONVEX_DEPLOY_URL"]);
      expect(deployFlags(convex)).toStrictEqual([[]]);
      expect(deploy.written).toStrictEqual(
        new Map([
          [
            webEnvFile,
            [
              "VITE_CONVEX_SITE_URL=https://happy-otter-123.convex.site",
              `VITE_CONVEX_URL=${CONVEX_URL}`,
              "VITE_HAS_DEMO_LOGIN=false",
              "VITE_SITE_URL=https://isbabyoutyet.com",
              "",
            ].join("\n"),
          ],
        ]),
      );
    }),
  );

  it("writes the env file `vite build` loads in the web package", () => {
    expect(webEnvFile).toMatch(/projects\/isbabyoutyet\/web\/\.env\.production\.local$/);
  });

  it.effect("new preview: retries a start_push 408 without a wipe", () =>
    Effect.gen(function* () {
      let deploys = 0;
      const convex = fakeConvex(() =>
        deploys++ === 0 ? Effect.fail(START_PUSH_408) : Effect.succeed(CONVEX_URL),
      );
      const deploy = deployWith({ convex, env: previewEnv });

      yield* deploy.run;

      expect(deployFlags(convex)).toStrictEqual([
        ["--preview-name", "feat/demo"],
        ["--preview-name", "feat/demo"],
      ]);
      expect(deploy.written.get(webEnvFile)).toContain("VITE_HAS_DEMO_LOGIN=true\n");
      expect(deploy.written.get(webEnvFile)).toContain(
        "VITE_SITE_URL=https://isbabyoutyet-git-feat-demo.vercel.app\n",
      );
    }),
  );

  it.effect("rejected schema: recreates the preview", () =>
    Effect.gen(function* () {
      let deploys = 0;
      const convex = fakeConvex(() =>
        deploys++ === 0 ? Effect.fail(SCHEMA_REJECTED) : Effect.succeed(`${CONVEX_URL}\n`),
      );

      yield* deployWith({ convex, env: previewEnv }).run;

      expect(deployFlags(convex)).toStrictEqual([
        ["--preview-name", "feat/demo"],
        ["--preview-create", "feat/demo"],
      ]);
    }),
  );

  it.effect("a recreated preview that times out is retried without a second wipe", () =>
    Effect.gen(function* () {
      const replies = [Effect.fail(SCHEMA_REJECTED), Effect.fail(START_PUSH_408)];
      const convex = fakeConvex(() => replies.shift() ?? Effect.succeed(`${CONVEX_URL}\n`));

      yield* deployWith({ convex, env: previewEnv }).run;

      expect(deployFlags(convex)).toStrictEqual([
        ["--preview-name", "feat/demo"],
        ["--preview-create", "feat/demo"],
        ["--preview-name", "feat/demo"],
      ]);
    }),
  );

  it.effect("production never wipes: a rejected schema fails the build", () =>
    Effect.gen(function* () {
      const convex = fakeConvex(() => Effect.fail(SCHEMA_REJECTED));
      const deploy = deployWith({ convex, env: productionEnv });

      const error = yield* deploy.run.pipe(Effect.flip);

      expect(error).toStrictEqual(new ConvexSchemaValidationError());
      expect(deployFlags(convex)).toStrictEqual([[]]);
      expect(deploy.written.size).toBe(0);
    }),
  );

  it.effect("merge queue: points the web build at the placeholder without touching Convex", () =>
    Effect.gen(function* () {
      const convex = fakeConvex(() => Effect.succeed(CONVEX_URL));
      const deploy = deployWith({
        convex,
        // No runtime secrets: a merge-queue build has no backend to configure.
        env: {
          VERCEL_BRANCH_URL: previewEnv.VERCEL_BRANCH_URL,
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: "gh-readonly-queue/main/pr-280-0a1b2c3d",
          VERCEL_PROJECT_PRODUCTION_URL: previewEnv.VERCEL_PROJECT_PRODUCTION_URL,
        },
      });

      yield* deploy.run;

      expect(convex.calls).toStrictEqual([]);
      expect(deploy.written.get(webEnvFile)).toContain(
        `VITE_CONVEX_URL=${MERGE_QUEUE_PLACEHOLDER_CONVEX_URL}\n`,
      );
    }),
  );

  it.effect("fails before deploying when a secret `configure:vercel` needs is missing", () =>
    Effect.gen(function* () {
      const convex = fakeConvex(() => Effect.succeed(CONVEX_URL));
      const env = Object.fromEntries(
        Object.entries(productionEnv).filter(([name]) => name !== "RESEND_API_KEY"),
      );
      const deploy = deployWith({ convex, env });

      const result = yield* Effect.result(deploy.run);

      expect(Result.isFailure(result)).toBe(true);
      expect(convex.calls).toStrictEqual([]);
      expect(deploy.written.size).toBe(0);
    }),
  );
});
