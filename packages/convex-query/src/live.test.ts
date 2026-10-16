import { Query, QueryClient } from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { Effect } from "effect";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { connectConvexLive } from "./live.ts";
import { convexPaginatedQuery, convexQuery } from "./queries.ts";
import { ConvexReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

const getMessage = makeFunctionReference<"query", { id: string }, string>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");

const message = convexQuery(getMessage);
const messageList = convexPaginatedQuery(listMessages);

/** Cursors are item ids: a page starts after its cursor and, if pinned, ends at `endCursor`. */
function paginate(items: ReadonlyArray<string>, opts: PaginationOptions): PaginationResult<string> {
  const start = opts.cursor === null ? 0 : items.indexOf(opts.cursor) + 1;
  const end = opts.endCursor ? items.indexOf(opts.endCursor) + 1 : start + opts.numItems;
  const page = items.slice(start, end);
  return {
    continueCursor: opts.endCursor ?? page.at(-1) ?? opts.cursor ?? "",
    isDone: end >= items.length,
    page,
  };
}

function setup() {
  vi.useFakeTimers();
  const messages = new Map([["a", "hello"]]);
  const items = ["a", "b", "c", "d", "e"];
  let failing = false;
  const held = new Map<string, { reached(): void; released: Promise<void> }>();
  const backend = makeTestConvexClient(async (query, args) => {
    if (failing) {
      throw new Error("Not allowed");
    }
    switch (getFunctionName(query)) {
      case "messages:get": {
        return messages.get(args.id) ?? null;
      }
      case "messages:list": {
        const pageOpts = args.paginationOpts;
        const page = paginate(items, pageOpts);
        const hold = held.get(
          String(pageOpts.cursor) + (pageOpts.endCursor ? `..${pageOpts.endCursor}` : ""),
        );
        hold?.reached();
        await hold?.released;
        return page;
      }
      default: {
        throw new Error("Unknown query");
      }
    }
  });
  const queryClient = new QueryClient({
    isServer: false,
    layer: ConvexReader.layerWatch(backend.client),
  });
  const disconnect = connectConvexLive({ client: backend.client, queryClient });
  onTestFinished(async () => {
    disconnect();
    await queryClient.dispose();
    vi.useRealTimers();
  });
  return {
    backend,
    disconnect,
    fail: () => {
      failing = true;
    },
    /**
     * Hold the response to reads of the unpinned page starting after `cursor`
     * (`"null"` for the first) until `release` is called. The page is read
     * before it is held; `reached` resolves once a read is held.
     */
    hold: (cursor: string) => {
      const reached = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      held.set(cursor, { reached: reached.resolve, released: released.promise });
      return {
        reached: reached.promise,
        release: () => {
          held.delete(cursor);
          released.resolve();
        },
      };
    },
    items,
    messages,
    queryClient,
  };
}

describe("connectConvexLive", () => {
  it("writes every result of a cached query into the cache", async () => {
    const live = setup();
    const handle = await live.queryClient.ensure(message, { id: "a" });
    expect(handle.data).toBe("hello");
    expect(live.queryClient.getData(message, { id: "a" })).toBe("hello");

    live.messages.set("a", "edited");
    await live.backend.refresh();
    expect(live.queryClient.getData(message, { id: "a" })).toBe("edited");
  });

  it("unsubscribes when the entry leaves the cache", async () => {
    const live = setup();
    await live.queryClient.ensure(message, { id: "a" });
    // The read's own subscription lapses; the live one remains.
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([{ args: { id: "a" }, name: "messages:get" }]);

    live.queryClient.remove(message, { id: "a" });
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("pins every page but the last, so items added inside a page stay on it", async () => {
    const live = setup();
    const factory = messageList;
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(factory, input, { pages: 2 });
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "b", numItems: 2 }, room: "lobby" },
        { paginationOpts: { cursor: "b", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(live.backend.subscriptions()).toHaveLength(2);

    live.items.unshift("new");
    await live.backend.refresh();
    const data = live.queryClient.getData(factory, input);
    expect(data?.pages.map((page) => page.page)).toEqual([
      ["new", "a", "b"],
      ["c", "d"],
    ]);
    expect(data?.pageParams).toEqual([
      { cursor: null, numItems: 2 },
      { cursor: "b", numItems: 2 },
    ]);
  });

  it("subscribes a page once it loads, and re-pins the page before it", async () => {
    const live = setup();
    const factory = messageList;
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(factory, input);
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual([
      { paginationOpts: { cursor: null, numItems: 2 }, room: "lobby" },
    ]);

    await Effect.runPromise(Query.fetchNextPage(live.queryClient.getQuery(factory, input)));
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "b", numItems: 2 }, room: "lobby" },
        { paginationOpts: { cursor: "b", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(live.backend.subscriptions()).toHaveLength(2);
  });

  it("keeps a page update that lands while the next page loads", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(messageList, input, { pages: 2 });

    const { release } = live.hold("d");
    const nextPage = Effect.runPromise(
      Query.fetchNextPage(live.queryClient.getQuery(messageList, input)),
    );
    live.items.unshift("new");
    // The held page's subscription re-runs too, so this settles on release.
    const refreshed = live.backend.refresh();
    await vi.waitFor(() => {
      expect(live.queryClient.getData(messageList, input)?.pages[0]?.page).toEqual([
        "new",
        "a",
        "b",
      ]);
    });

    release();
    await Promise.all([nextPage, refreshed]);
    await vi.waitFor(() => {
      expect(live.queryClient.getData(messageList, input)?.pages.map((page) => page.page)).toEqual([
        ["new", "a", "b"],
        ["c", "d"],
        ["e"],
      ]);
    });
  });

  it("keeps a page update that lands while every page refetches", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(messageList, input, { pages: 2 });
    // The reads' own subscriptions lapse, so the refetch reads the backend.
    vi.advanceTimersByTime(5000);

    // The refetch reads the first page before this insert, and lands after it.
    const firstPage = live.hold("null");
    const refetch = Effect.runPromise(Query.refetch(live.queryClient.getQuery(messageList, input)));
    await firstPage.reached;
    live.items.unshift("new");
    const refreshed = live.backend.refresh();
    await vi.waitFor(() => {
      expect(live.queryClient.getData(messageList, input)?.pages[0]?.page).toEqual([
        "new",
        "a",
        "b",
      ]);
    });

    firstPage.release();
    await Promise.all([refetch, refreshed]);
    await vi.waitFor(() => {
      expect(live.queryClient.getData(messageList, input)?.pages.map((page) => page.page)).toEqual([
        ["new", "a", "b"],
        ["c", "d"],
      ]);
    });
  });

  it("follows the page boundaries a refetch moves", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(messageList, input, { pages: 2 });
    vi.advanceTimersByTime(5000);

    live.items.shift();
    await Effect.runPromise(Query.refetch(live.queryClient.getQuery(messageList, input)));
    vi.advanceTimersByTime(5000);
    expect(live.queryClient.getData(messageList, input)?.pages.map((page) => page.page)).toEqual([
      ["b", "c"],
      ["d", "e"],
    ]);
    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "c", numItems: 2 }, room: "lobby" },
        { paginationOpts: { cursor: "c", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(live.backend.subscriptions()).toHaveLength(2);
  });

  it("invalidates the entry when its subscription fails", async () => {
    const live = setup();
    await live.queryClient.ensure(message, { id: "a" });
    live.fail();
    await live.backend.refresh();
    const state = Query.getUnsafe(live.queryClient.getQuery(message, { id: "a" }));
    expect(state.isInvalidated).toBe(true);
    expect(state.data).toBe("hello");
  });

  it("subscribes entries that were cached before it connected, until disconnected", async () => {
    const live = setup();
    live.disconnect();
    await live.queryClient.ensure(message, { id: "a" });
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);

    const disconnect = connectConvexLive({
      client: live.backend.client,
      queryClient: live.queryClient,
    });
    expect(live.backend.subscriptions()).toHaveLength(1);
    disconnect();
    expect(live.backend.subscriptions()).toEqual([]);
  });
});
