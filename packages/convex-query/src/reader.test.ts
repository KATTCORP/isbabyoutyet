import { describe, expect, it } from "@effect/vitest";
import { makeFunctionReference } from "convex/server";
import { Effect, Exit, Fiber } from "effect";
import { onTestFinished, vi } from "vitest";
import { ConvexQueryError, ConvexReader, readConvexQuery } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

const getMessage = makeFunctionReference<"query", { id: string }, string>("messages:get");

const readMessage = (id: string) => readConvexQuery(getMessage, { id });

describe("ConvexReader.layerWatch", () => {
  it.effect("resolves with the first result", () =>
    Effect.gen(function* () {
      const backend = makeTestConvexClient(async (_query, args) => `message ${args.id}`);
      const message = yield* readMessage("a").pipe(
        Effect.provide(ConvexReader.layerWatch(backend.client)),
      );
      expect(message).toBe("message a");
    }),
  );

  it("keeps the subscription for a moment after the first result", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const backend = makeTestConvexClient(async () => "hello");
    await Effect.runPromise(
      readMessage("a").pipe(Effect.provide(ConvexReader.layerWatch(backend.client))),
    );
    expect(backend.subscriptions()).toEqual([{ args: { id: "a" }, name: "messages:get" }]);
    vi.advanceTimersByTime(5000);
    expect(backend.subscriptions()).toEqual([]);
  });

  it.effect("fails with the query's error", () =>
    Effect.gen(function* () {
      const backend = makeTestConvexClient(async () => {
        throw new Error("Baby not found");
      });
      const error = yield* readMessage("a").pipe(
        Effect.provide(ConvexReader.layerWatch(backend.client)),
        Effect.flip,
      );
      expect(error).toBeInstanceOf(ConvexQueryError);
      expect(error.functionName).toBe("messages:get");
      expect(error.message).toBe("Baby not found");
      expect(backend.subscriptions()).toEqual([]);
    }),
  );

  it.effect("unsubscribes when interrupted before a result", () =>
    Effect.gen(function* () {
      const backend = makeTestConvexClient(() => new Promise(() => {}));
      const fiber = yield* readMessage("a").pipe(
        Effect.provide(ConvexReader.layerWatch(backend.client)),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      expect(backend.subscriptions()).toHaveLength(1);
      const exit = yield* Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber)));
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(backend.subscriptions()).toEqual([]);
    }),
  );
});

describe("ConvexReader.layerSnapshot", () => {
  it.effect("reads through consistentQuery", () =>
    Effect.gen(function* () {
      const calls: Array<string> = [];
      const message = yield* readMessage("a").pipe(
        Effect.provide(
          ConvexReader.layerSnapshot({
            consistentQuery: async (_query, args) => {
              calls.push(JSON.stringify(args));
              return "snapshot";
            },
          }),
        ),
      );
      expect(message).toBe("snapshot");
      expect(calls).toEqual(['{"id":"a"}']);
    }),
  );

  it.effect("fails with a ConvexQueryError naming the function", () =>
    Effect.gen(function* () {
      const error = yield* readMessage("a").pipe(
        Effect.provide(
          ConvexReader.layerSnapshot({
            consistentQuery: () => Promise.reject(new Error("Unauthenticated")),
          }),
        ),
        Effect.flip,
      );
      expect(error.functionName).toBe("messages:get");
      expect(error.message).toBe("Unauthenticated");
    }),
  );
});
