// @vitest-environment node
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, FileSystem, Layer } from "effect";
import { TestClock, TestConsole } from "effect/testing";
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
  it.effect("retries once a second until Convex answers", () =>
    Effect.gen(function* () {
      const convex = convexReadyAfter(3);
      const fiber = yield* Effect.forkChild(waitForConvexReady.pipe(Effect.provide(convex.layer)));

      yield* TestClock.adjust("2 seconds");
      expect(fiber.pollUnsafe()).toBeUndefined();
      expect(convex.calls).toHaveLength(3);

      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);
      expect(convex.calls).toHaveLength(4);
    }),
  );

  it.effect("gives up after 120 attempts and keeps the last CLI error as the cause", () =>
    Effect.gen(function* () {
      const convex = convexReadyAfter(Number.POSITIVE_INFINITY);
      const fiber = yield* Effect.forkChild(
        waitForConvexReady.pipe(Effect.flip, Effect.provide(convex.layer)),
      );

      yield* TestClock.adjust("2 minutes");
      const error = yield* Fiber.join(fiber);

      expect(error.message).toBe(
        "Timed out waiting for Convex dev backend before seeding homepage photos",
      );
      expect(error.cause).toBe(notReady);
      expect(convex.calls).toHaveLength(120);
    }),
  );
});

describe("seedHomepagePhotosDeferred", () => {
  it.effect("does nothing without the pending marker", () =>
    Effect.gen(function* () {
      const convex = convexReadyAfter(0);
      let seeded = false;

      yield* seedHomepagePhotosDeferred(
        Effect.sync(() => {
          seeded = true;
        }),
      ).pipe(Effect.provide(Layer.merge(convex.layer, markerFileSystem(false).layer)));

      expect(convex.calls).toStrictEqual([]);
      expect(seeded).toBe(false);
    }),
  );

  it.effect("waits for Convex, seeds, then removes the marker", () =>
    Effect.gen(function* () {
      const convex = convexReadyAfter(1);
      const fs = markerFileSystem(true);
      const order: Array<string> = [];

      const fiber = yield* Effect.forkChild(
        seedHomepagePhotosDeferred(
          Effect.sync(() => {
            order.push(`seed after ${convex.calls.length} calls`);
          }),
        ).pipe(Effect.provide(Layer.merge(convex.layer, fs.layer))),
      );
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(fiber);

      expect(order).toStrictEqual(["seed after 2 calls"]);
      expect(fs.removed).toStrictEqual([HOMEPAGE_DEMO_PHOTOS_PENDING_MARKER]);
      expect(yield* TestConsole.logLines).toStrictEqual([
        "Homepage demo photos pending — waiting for Convex dev backend...",
        "Homepage demo photos seeded.",
      ]);
    }),
  );

  it.effect("keeps the marker when seeding fails, so the next `pnpm dev` retries", () =>
    Effect.gen(function* () {
      const fs = markerFileSystem(true);

      const error = yield* seedHomepagePhotosDeferred(Effect.fail("upload failed")).pipe(
        Effect.flip,
        Effect.provide(Layer.merge(convexReadyAfter(0).layer, fs.layer)),
      );

      expect(error).toBe("upload failed");
      expect(fs.removed).toStrictEqual([]);
    }),
  );
});
