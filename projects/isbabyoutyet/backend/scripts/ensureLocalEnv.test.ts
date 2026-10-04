// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import { ConvexCliError } from "@workspace/convex-cli";
import { fakeConvexCli } from "@workspace/convex-cli/testing";
import dotenv from "dotenv";
import { Effect } from "effect";
import { TestConsole } from "effect/testing";
import { LOCAL_DEV_CONVEX_ENV } from "../src/localDevEnv";
import { ensureLocalConvexEnv } from "./ensureLocalEnv";

const completeEnv = {
  ...LOCAL_DEV_CONVEX_ENV,
  VAPID_PRIVATE_KEY: "private",
  VAPID_PUBLIC_KEY: "public",
};

/** A Convex deployment whose `env list` prints `env`. */
function convexWithEnv(env: Record<string, string>) {
  return fakeConvexCli((call) =>
    Effect.succeed(
      call.args.join(" ") === "env list"
        ? Object.entries(env)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n")
        : "",
    ),
  );
}

function envSetInput(calls: ReturnType<typeof convexWithEnv>["calls"]) {
  return calls
    .filter((call) => call.args.join(" ") === "env set --force")
    .map((call) => dotenv.parse(call.stdin ?? ""));
}

describe("ensureLocalConvexEnv", () => {
  it.effect("leaves a complete env alone", () =>
    Effect.gen(function* () {
      const convex = convexWithEnv(completeEnv);

      yield* ensureLocalConvexEnv.pipe(Effect.provide(convex.layer));

      expect(convex.calls.map((call) => call.args)).toStrictEqual([["env", "list"]]);
      expect(yield* TestConsole.logLines).toStrictEqual([
        "Convex env already has the required local values.",
      ]);
    }),
  );

  it.effect("sets only the invalid static values and keeps existing VAPID keys", () =>
    Effect.gen(function* () {
      const convex = convexWithEnv({ ...completeEnv, EMAIL_FROM: "not-an-email" });

      yield* ensureLocalConvexEnv.pipe(Effect.provide(convex.layer));

      expect(envSetInput(convex.calls)).toStrictEqual([
        { EMAIL_FROM: LOCAL_DEV_CONVEX_ENV.EMAIL_FROM },
      ]);
    }),
  );

  it.effect("generates a VAPID key pair in the same `env set` when either key is missing", () =>
    Effect.gen(function* () {
      const convex = convexWithEnv({ ...LOCAL_DEV_CONVEX_ENV, VAPID_PUBLIC_KEY: "public" });

      yield* ensureLocalConvexEnv.pipe(Effect.provide(convex.layer));

      expect(envSetInput(convex.calls)).toStrictEqual([
        {
          VAPID_PRIVATE_KEY: expect.stringMatching(/^[\w-]{43}$/),
          VAPID_PUBLIC_KEY: expect.stringMatching(/^[\w-]{87}$/),
        },
      ]);
      expect(yield* TestConsole.logLines).toStrictEqual([
        "convex env set VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY",
      ]);
    }),
  );

  it.effect("stops at the first CLI failure", () =>
    Effect.gen(function* () {
      const failure = new ConvexCliError({
        command: "env list",
        exitCode: 1,
        stderr: "✖ Local backend isn't running.",
        stdout: "",
      });
      const convex = fakeConvexCli(() => Effect.fail(failure));

      const error = yield* ensureLocalConvexEnv.pipe(Effect.flip, Effect.provide(convex.layer));

      expect(error).toStrictEqual(failure);
      expect(convex.calls).toHaveLength(1);
    }),
  );
});
