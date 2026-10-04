// @vitest-environment node
import { Effect, Layer, Result } from "effect";
import { TestConsole } from "effect/testing";
import { describe, expect, it } from "vitest";
import { LOCAL_DEV_CONVEX_ENV } from "../src/localDevEnv";
import { ConvexCli, ConvexCliError } from "./convexCli";
import { ensureLocalConvexEnv } from "./ensureLocalEnv";

const completeEnv = {
  ...LOCAL_DEV_CONVEX_ENV,
  VAPID_PRIVATE_KEY: "private",
  VAPID_PUBLIC_KEY: "public",
};

/** A `ConvexCli` whose `env list` prints `env`, recording every call. */
function fakeConvexCli(env: Record<string, string>) {
  const calls: Array<ReadonlyArray<string>> = [];
  const layer = Layer.succeed(
    ConvexCli,
    ConvexCli.of({
      run: (args) =>
        Effect.sync(() => {
          calls.push(args);
          return args.join(" ") === "env list"
            ? Object.entries(env)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n")
            : "";
        }),
    }),
  );
  return { calls, layer };
}

function ensure(convexCli: Layer.Layer<ConvexCli>) {
  return Effect.gen(function* () {
    const result = yield* Effect.result(ensureLocalConvexEnv);
    const logs = yield* TestConsole.logLines;
    return { logs, result };
  }).pipe(Effect.provide(Layer.merge(convexCli, TestConsole.layer)), Effect.runPromise);
}

describe("ensureLocalConvexEnv", () => {
  it("leaves a complete env alone", async () => {
    const convex = fakeConvexCli(completeEnv);

    const run = await ensure(convex.layer);

    expect(run.result).toStrictEqual(Result.succeed(undefined));
    expect(convex.calls).toStrictEqual([["env", "list"]]);
    expect(run.logs).toStrictEqual(["Convex env already has the required local values."]);
  });

  it("sets only the invalid static values and keeps existing VAPID keys", async () => {
    const convex = fakeConvexCli({ ...completeEnv, EMAIL_FROM: "not-an-email" });

    await ensure(convex.layer);

    expect(convex.calls).toStrictEqual([
      ["env", "list"],
      ["env", "set", "EMAIL_FROM", LOCAL_DEV_CONVEX_ENV.EMAIL_FROM],
    ]);
  });

  it("generates a VAPID key pair when either key is missing", async () => {
    const convex = fakeConvexCli({ ...LOCAL_DEV_CONVEX_ENV, VAPID_PUBLIC_KEY: "public" });

    const run = await ensure(convex.layer);

    expect(convex.calls).toStrictEqual([
      ["env", "list"],
      ["env", "set", "VAPID_PUBLIC_KEY", expect.stringMatching(/^[\w-]{87}$/)],
      ["env", "set", "VAPID_PRIVATE_KEY", expect.stringMatching(/^[\w-]{43}$/)],
    ]);
    expect(run.logs).toStrictEqual([
      "convex env set VAPID_PUBLIC_KEY",
      "convex env set VAPID_PRIVATE_KEY",
    ]);
  });

  it("stops at the first CLI failure", async () => {
    const error = new ConvexCliError({
      command: "env list",
      exitCode: 1,
      stderr: "✖ Local backend isn't running.",
      stdout: "",
    });
    const calls: Array<ReadonlyArray<string>> = [];
    const failing = Layer.succeed(
      ConvexCli,
      ConvexCli.of({
        run: (args) => Effect.sync(() => calls.push(args)).pipe(Effect.andThen(Effect.fail(error))),
      }),
    );

    const run = await ensure(failing);

    expect(run.result).toStrictEqual(Result.fail(error));
    expect(calls).toStrictEqual([["env", "list"]]);
  });
});
