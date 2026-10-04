import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { ConvexCliError } from "./convexCli";
import {
  ConvexDeployOutputError,
  ConvexPushTimeoutError,
  ConvexSchemaValidationError,
  deploy,
} from "./deploy";
import { fakeConvexCli } from "./testing";

function deployFailure(stderr: string) {
  return new ConvexCliError({
    command: "deploy --cmd-url-env-var-name",
    exitCode: 1,
    stderr,
    stdout: "",
  });
}

describe("deploy", () => {
  it.effect("returns the URL its `--cmd` printed, passing the caller's flags through", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed("https://happy-otter-123.convex.cloud\n"));

      const url = yield* deploy(["--preview-name", "feat/demo"]).pipe(Effect.provide(convex.layer));

      expect(url).toBe("https://happy-otter-123.convex.cloud");
      expect(convex.calls).toStrictEqual([
        {
          args: [
            "deploy",
            "--cmd-url-env-var-name",
            "CONVEX_DEPLOY_URL",
            "--cmd",
            "printenv CONVEX_DEPLOY_URL",
            "--preview-name",
            "feat/demo",
          ],
          stdin: undefined,
        },
      ]);
    }),
  );

  it.effect("takes the last URL line when the CLI prints anything else on stdout", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() =>
        Effect.succeed("Preparing…\nhttps://happy-otter-123.convex.cloud\n\n"),
      );

      const url = yield* deploy([]).pipe(Effect.provide(convex.layer));

      expect(url).toBe("https://happy-otter-123.convex.cloud");
    }),
  );

  it.effect("fails when no URL was printed", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed("done\n"));

      const error = yield* deploy([]).pipe(Effect.provide(convex.layer), Effect.flip);

      expect(error).toStrictEqual(new ConvexDeployOutputError({ stdout: "done\n" }));
    }),
  );

  it.effect("turns a start_push 408 into ConvexPushTimeoutError", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() =>
        Effect.fail(
          deployFailure(
            "✖ Error fetching POST  https://small-bandicoot-574.convex.cloud/api/deploy2/start_push 408 Request Timeout",
          ),
        ),
      );

      const error = yield* deploy([]).pipe(Effect.provide(convex.layer), Effect.flip);

      expect(error).toStrictEqual(new ConvexPushTimeoutError());
    }),
  );

  it.effect("turns a rejected schema into ConvexSchemaValidationError", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() =>
        Effect.fail(
          deployFailure(
            '✖ Schema validation failed.\nDocument with ID "j57…" in table "baby" does not match the schema: Object is missing the required field `lastActivityAt`.',
          ),
        ),
      );

      const error = yield* deploy(["--preview-name", "feat/demo"]).pipe(
        Effect.provide(convex.layer),
        Effect.flip,
      );

      expect(error).toStrictEqual(new ConvexSchemaValidationError());
    }),
  );

  it.effect("keeps every other failure as the CLI error", () =>
    Effect.gen(function* () {
      const failure = deployFailure(
        "✖ Error fetching POST  https://helpful-dotterel-790.convex.cloud/api/deploy2/start_push 500 Internal Server Error",
      );
      const convex = fakeConvexCli(() => Effect.fail(failure));

      const error = yield* deploy([]).pipe(Effect.provide(convex.layer), Effect.flip);

      expect(error).toStrictEqual(failure);
    }),
  );
});
