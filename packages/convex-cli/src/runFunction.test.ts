import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { ConvexPreviewName } from "./previewName";
import { ConvexRunOutputError, runFunction } from "./runFunction";
import { fakeConvexCli } from "./testing";

const isComplete = runFunction({
  args: { locale: "en" },
  functionName: "demo:isComplete",
  returns: Schema.Boolean,
});

describe("runFunction", () => {
  it.effect("passes JSON args and decodes the last line that matches `returns`", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed("[CONVEX Q] log line\ntrue\n"));

      const complete = yield* isComplete.pipe(Effect.provide(convex.layer));

      expect(complete).toBe(true);
      expect(convex.calls).toStrictEqual([
        { args: ["run", "demo:isComplete", '{"locale":"en"}'], stdin: undefined },
      ]);
    }),
  );

  it.effect("targets the `ConvexPreviewName` preview", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed("false"));

      yield* isComplete.pipe(
        Effect.provideService(ConvexPreviewName, Option.some("pr-123")),
        Effect.provide(convex.layer),
      );

      expect(convex.calls[0]?.args.slice(-2)).toStrictEqual(["--preview-name", "pr-123"]);
    }),
  );

  it.effect("fails with the raw output when nothing decodes", () =>
    Effect.gen(function* () {
      const convex = fakeConvexCli(() => Effect.succeed("maybe"));

      const error = yield* isComplete.pipe(Effect.flip, Effect.provide(convex.layer));

      expect(error).toStrictEqual(
        new ConvexRunOutputError({ functionName: "demo:isComplete", stdout: "maybe" }),
      );
      expect(error.message).toBe("Could not decode `convex run demo:isComplete` output:\nmaybe");
    }),
  );
});
