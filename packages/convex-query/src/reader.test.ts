import { makeFunctionReference } from "convex/server";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ConvexReader } from "./reader.ts";
import { ConvexQueryError, snapshotReader, subscribingReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

const getMessage = makeFunctionReference<"query", { id: string }, string>("messages:get");

function readMessage(reader: ConvexReader, signal = new AbortController().signal) {
  return reader.query({ args: { id: "a" }, query: getMessage, signal });
}

describe("subscribingReader", () => {
  it("resolves with the first result", async () => {
    const backend = makeTestConvexClient(async (_query, args) => `message ${args.id}`);
    expect(await readMessage(subscribingReader(backend.client))).toBe("message a");
  });

  it("keeps the subscription for a moment after the first result", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const backend = makeTestConvexClient(async () => "hello");
    await readMessage(subscribingReader(backend.client));
    expect(backend.subscriptions()).toEqual([{ args: { id: "a" }, name: "messages:get" }]);
    vi.advanceTimersByTime(5000);
    expect(backend.subscriptions()).toEqual([]);
  });

  it("rejects with the query's error", async () => {
    const backend = makeTestConvexClient(async () => {
      throw new Error("Baby not found");
    });
    const read = readMessage(subscribingReader(backend.client));
    await expect(read).rejects.toBeInstanceOf(ConvexQueryError);
    await expect(read).rejects.toMatchObject({
      functionName: "messages:get",
      message: "Baby not found",
    });
    expect(backend.subscriptions()).toEqual([]);
  });

  it("unsubscribes when aborted before a result", async () => {
    const backend = makeTestConvexClient(() => new Promise(() => {}));
    const controller = new AbortController();
    const read = readMessage(subscribingReader(backend.client), controller.signal);
    expect(backend.subscriptions()).toHaveLength(1);

    const reason = new Error("dropped");
    controller.abort(reason);
    await expect(read).rejects.toBe(reason);
    expect(backend.subscriptions()).toEqual([]);
  });

  it("never subscribes for a read that starts aborted", async () => {
    const backend = makeTestConvexClient(async () => "hello");
    const reason = new Error("dropped");
    const read = readMessage(subscribingReader(backend.client), AbortSignal.abort(reason));
    await expect(read).rejects.toBe(reason);
    expect(backend.subscriptions()).toEqual([]);
  });
});

describe("snapshotReader", () => {
  it("reads through consistentQuery", async () => {
    const calls: Array<string> = [];
    const reader = snapshotReader({
      consistentQuery: async (_query, args) => {
        calls.push(JSON.stringify(args));
        return "snapshot";
      },
    });
    expect(await readMessage(reader)).toBe("snapshot");
    expect(calls).toEqual(['{"id":"a"}']);
  });

  it("rejects with a ConvexQueryError naming the function", async () => {
    const reader = snapshotReader({
      consistentQuery: () => Promise.reject(new Error("Unauthenticated")),
    });
    const read = readMessage(reader);
    await expect(read).rejects.toBeInstanceOf(ConvexQueryError);
    await expect(read).rejects.toMatchObject({
      functionName: "messages:get",
      message: "Unauthenticated",
    });
  });

  it("names the function when the failure has no message", async () => {
    const reader = snapshotReader({ consistentQuery: () => Promise.reject("offline") });
    const error = await rejection(readMessage(reader));
    expect(error).toMatchObject({
      cause: "offline",
      message: "Convex query `messages:get` failed",
    });
  });
});
