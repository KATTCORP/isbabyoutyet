// @vitest-environment node
import { Effect, Fiber, FileSystem, Layer, Option, Result } from "effect";
import { TestClock, TestConsole } from "effect/testing";
import { describe, expect, it } from "vitest";
import { ConvexCli, ConvexCliError } from "./convexCli";
import {
  HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER,
  seedHomepagePhotosDeferred,
  waitForConvexReady,
} from "./seedHomepagePhotosDeferred";

const notReady = new ConvexCliError({
  command: "run homepageDemo:hasCompletePhotoSet",
  exitCode: 1,
  stderr: "✖ Could not find function",
  stdout: "",
});

/** A `ConvexCli` that fails its first `failures` calls, then answers `false`. */
function convexReadyAfter(failures: number) {
  const calls: Array<ReadonlyArray<string>> = [];
  const layer = Layer.succeed(
    ConvexCli,
    ConvexCli.of({
      run: (args) =>
        Effect.suspend(() => {
          calls.push(args);
          return calls.length > failures ? Effect.succeed("false") : Effect.fail(notReady);
        }),
    }),
  );
  return { calls, layer };
}

function markerFileSystem(markerExists: boolean) {
  const removed: Array<string> = [];
  const layer = FileSystem.layerNoop({
    exists: (path) => Effect.succeed(markerExists && path === HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER),
    remove: (path) =>
      Effect.sync(() => {
        removed.push(path);
      }),
  });
  return { layer, removed };
}

describe("waitForConvexReady", () => {
  it("retries once a second until Convex answers", async () => {
    const convex = convexReadyAfter(3);

    const result = await Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.result(waitForConvexReady));
      yield* TestClock.adjust("2 seconds");
      expect(fiber.pollUnsafe()).toBeUndefined();
      expect(convex.calls).toHaveLength(3);
      yield* TestClock.adjust("1 second");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(Layer.merge(convex.layer, TestClock.layer())), Effect.runPromise);

    expect(result).toStrictEqual(Result.succeed(undefined));
    expect(convex.calls).toHaveLength(4);
  });

  it("gives up after 120 attempts and keeps the last CLI error as the cause", async () => {
    const convex = convexReadyAfter(Number.POSITIVE_INFINITY);

    const result = await Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.result(waitForConvexReady));
      yield* TestClock.adjust("2 minutes");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(Layer.merge(convex.layer, TestClock.layer())), Effect.runPromise);

    const error = Option.getOrThrow(Result.getFailure(result));
    expect(error.message).toBe(
      "Timed out waiting for Convex dev backend before seeding homepage photos",
    );
    expect(error.cause).toBe(notReady);
    expect(convex.calls).toHaveLength(120);
  });
});

describe("seedHomepagePhotosDeferred", () => {
  it("does nothing without the pending marker", async () => {
    const convex = convexReadyAfter(0);
    const fs = markerFileSystem(false);
    let seeded = false;

    await seedHomepagePhotosDeferred(
      Effect.sync(() => {
        seeded = true;
      }),
    ).pipe(
      Effect.provide(Layer.mergeAll(convex.layer, fs.layer, TestConsole.layer)),
      Effect.runPromise,
    );

    expect(convex.calls).toStrictEqual([]);
    expect(seeded).toBe(false);
  });

  it("waits for Convex, seeds, then removes the marker", async () => {
    const convex = convexReadyAfter(1);
    const fs = markerFileSystem(true);
    const order: Array<string> = [];

    const logs = await Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        seedHomepagePhotosDeferred(
          Effect.sync(() => {
            order.push(`seed after ${convex.calls.length} calls`);
          }),
        ),
      );
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);
      return yield* TestConsole.logLines;
    }).pipe(
      Effect.provide(Layer.mergeAll(convex.layer, fs.layer, TestConsole.layer, TestClock.layer())),
      Effect.runPromise,
    );

    expect(order).toStrictEqual(["seed after 2 calls"]);
    expect(fs.removed).toStrictEqual([HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER]);
    expect(logs).toStrictEqual([
      "Homepage demo photos pending — waiting for Convex dev backend...",
      "Homepage demo photos seeded.",
    ]);
  });

  it("keeps the marker when seeding fails, so the next `pnpm dev` retries", async () => {
    const fs = markerFileSystem(true);

    const result = await seedHomepagePhotosDeferred(Effect.fail("upload failed")).pipe(
      Effect.result,
      Effect.provide(Layer.mergeAll(convexReadyAfter(0).layer, fs.layer, TestConsole.layer)),
      Effect.runPromise,
    );

    expect(result).toStrictEqual(Result.fail("upload failed"));
    expect(fs.removed).toStrictEqual([]);
  });
});
