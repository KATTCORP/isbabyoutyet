import { Query, QueryClient, queryOptions } from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { Effect, Fiber, Option, Stream } from "effect";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { connectConvexLive, watchConvexQuery } from "./live.ts";
import {
  CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
  CONVEX_PAGINATED_QUERY_KEY,
  CONVEX_QUERY_KEY,
  convexBidirectionalPaginatedQuery,
  convexPaginatedQuery,
  convexQuery,
  ensureBidirectionalPaginatedQuery,
} from "./queries.ts";
import { ConvexReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

const getMessage = makeFunctionReference<"query", { id: string }, string>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");

const listNewerMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:listNewer");

const message = convexQuery(getMessage);
const messageList = convexPaginatedQuery(listMessages);
const aroundQueries = { backward: listNewerMessages, forward: listMessages };
const aroundMessage = convexBidirectionalPaginatedQuery(aroundQueries);

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
  /** Newer than `items`, nearest first: the backward direction of `aroundMessage`. */
  const newer = ["n1", "n2", "n3", "n4"];
  let failing = false;
  const held = new Map<string, { reached(): void; released: Promise<void> }>();
  let runs = 0;
  const backend = makeTestConvexClient(async (query, args) => {
    runs += 1;
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
      case "messages:listNewer": {
        return paginate(newer, args.paginationOpts);
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
    client: backend.client,
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
    newer,
    queryClient,
    /** How many times the backend ran a query. */
    runs: () => runs,
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
    // raf-query keeps the page written after the refetch read it.
    expect(live.queryClient.getData(messageList, input)?.pages.map((page) => page.page)).toEqual([
      ["new", "a", "b"],
      ["c", "d"],
    ]);
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

  it("pins both directions of a two-way query, writing each page where it sits", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    const query = live.queryClient.getQuery(aroundMessage, input);
    await live.queryClient.ensure(aroundMessage, input, { pages: 2 });
    await Effect.runPromise(Query.fetchPreviousPage(query));
    await Effect.runPromise(Query.fetchPreviousPage(query));
    vi.advanceTimersByTime(5000);

    const byName = (name: string) =>
      live.backend
        .subscriptions()
        .filter((subscription) => subscription.name === name)
        .map((subscription) => subscription.args);
    expect(byName("messages:list")).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "b", numItems: 2 }, room: "lobby" },
        { paginationOpts: { cursor: "b", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(byName("messages:listNewer")).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "n2", numItems: 2 }, room: "lobby" },
        { paginationOpts: { cursor: "n2", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(live.backend.subscriptions()).toHaveLength(4);

    // Inside the pinned newer page, and past the full top page: the first
    // grows in place, the other stays out until the next fetch.
    live.newer.unshift("n0");
    live.newer.push("n5");
    await live.backend.refresh();
    const data = live.queryClient.getData(aroundMessage, input);
    expect(data?.pages.map((page) => page.page)).toEqual([
      ["n3", "n4"],
      ["n0", "n1", "n2"],
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(data?.pageParams.map((param) => param.direction)).toEqual([
      "backward",
      "backward",
      "forward",
      "forward",
    ]);
  });

  it("keeps a short first backward page at its own size, open-ended on top, then pinned", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await ensureBidirectionalPaginatedQuery(live.queryClient, {
      input,
      previousNumItems: 1,
      queries: aroundQueries,
    });
    vi.advanceTimersByTime(5000);
    const newerSubscriptions = () =>
      live.backend
        .subscriptions()
        .filter((subscription) => subscription.name === "messages:listNewer")
        .map((subscription) => subscription.args);
    expect(newerSubscriptions()).toEqual([
      { paginationOpts: { cursor: null, numItems: 1 }, room: "lobby" },
    ]);

    // Newer than the short page's one item: it stays out, for a count to show.
    live.newer.push("n5");
    await live.backend.refresh();
    expect(live.queryClient.getData(aroundMessage, input)?.pages.map((page) => page.page)).toEqual([
      ["n1"],
      ["a", "b"],
    ]);

    await Effect.runPromise(
      Query.fetchPreviousPage(live.queryClient.getQuery(aroundMessage, input)),
    );
    vi.advanceTimersByTime(5000);
    expect(newerSubscriptions()).toEqual(
      expect.arrayContaining([
        { paginationOpts: { cursor: null, endCursor: "n1", numItems: 1 }, room: "lobby" },
        { paginationOpts: { cursor: "n1", numItems: 2 }, room: "lobby" },
      ]),
    );
    expect(newerSubscriptions()).toHaveLength(2);
    expect(live.queryClient.getData(aroundMessage, input)?.pages.map((page) => page.page)).toEqual([
      ["n2", "n3"],
      ["n1"],
      ["a", "b"],
    ]);
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

  it("invalidates a paged entry when a page subscription fails", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(messageList, input);
    live.fail();
    await live.backend.refresh();
    const state = Query.getUnsafe(live.queryClient.getQuery(messageList, input));
    expect(state.isInvalidated).toBe(true);
    expect(state.data?.pages[0]?.page).toEqual(["a", "b"]);
  });

  it("invalidates a two-way entry when a page subscription fails", async () => {
    const live = setup();
    const input = { args: { room: "lobby" }, numItems: 2 };
    await live.queryClient.ensure(aroundMessage, input);
    await Effect.runPromise(
      Query.fetchPreviousPage(live.queryClient.getQuery(aroundMessage, input)),
    );
    live.fail();
    await live.backend.refresh();
    const state = Query.getUnsafe(live.queryClient.getQuery(aroundMessage, input));
    expect(state.isInvalidated).toBe(true);
    expect(state.data?.pages.map((page) => page.page)).toEqual([
      ["n1", "n2"],
      ["a", "b"],
    ]);
  });

  it("leaves entries that aren't Convex queries alone", async () => {
    const live = setup();
    const other = (id: string) =>
      queryOptions({ queryFn: async () => id, queryKey: [CONVEX_QUERY_KEY, id] });
    await live.queryClient.ensure(other, "a");
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("leaves entries with malformed Convex keys or page params alone", async () => {
    const live = setup();
    const args = { room: "lobby" };
    const page = { continueCursor: "b", isDone: false, page: ["a", "b"] };
    const entries: ReadonlyArray<{ data: unknown; key: ReadonlyArray<unknown> }> = [
      { data: "x", key: [CONVEX_QUERY_KEY, 1, args] },
      { data: "x", key: ["other", "messages:get", args] },
      {
        data: { pageParams: [{ cursor: null }], pages: [page] },
        key: [CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY, "messages:list", 1, args, 2],
      },
      { data: { pages: [page] }, key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 2] },
      {
        data: { pageParams: [{}], pages: [page] },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 3],
      },
      {
        data: { pageParams: [{ cursor: 1 }], pages: [page] },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 4],
      },
      {
        data: { pageParams: [{ cursor: null, direction: "sideways" }], pages: [page] },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 5],
      },
      {
        data: { pageParams: [{ cursor: null }], pages: [page] },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 6],
      },
      {
        data: { pageParams: [{ cursor: null, numItems: "7" }], pages: [page] },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:list", args, 7],
      },
    ];
    for (const entry of entries) {
      const options = () =>
        queryOptions({ queryFn: async () => entry.data, queryKey: [...entry.key] });
      await live.queryClient.ensure(options, undefined);
    }
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
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

/** Await `promise` while `vi.waitFor` advances the fake timers Effect schedules on. */
async function settle<A>(promise: Promise<A>) {
  let result: { value: A } | undefined;
  void promise.then((value) => {
    result = { value };
  });
  return await vi.waitFor(() => {
    if (!result) {
      throw new Error("still pending");
    }
    return result.value;
  });
}

describe("watchConvexQuery", () => {
  const watchMessage = (live: ReturnType<typeof setup>) =>
    watchConvexQuery(live, { args: { id: "a" }, query: getMessage });

  it("subscribes itself and streams each new result", async () => {
    const live = setup();
    live.disconnect();
    const values = Effect.runPromise(watchMessage(live).pipe(Stream.take(2), Stream.runCollect));
    await vi.waitFor(() => {
      expect(live.queryClient.getData(message, { id: "a" })).toBe("hello");
    });

    await live.backend.refresh();
    live.messages.set("a", "edited");
    await live.backend.refresh();
    expect(await settle(values)).toEqual(["hello", "edited"]);
    expect(live.queryClient.getData(message, { id: "a" })).toBe("edited");
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("shares the entry and its read with a loader's ensure", async () => {
    const live = setup();
    const first = Effect.runPromise(Stream.runHead(watchMessage(live)));
    const handle = await live.queryClient.ensure(message, { id: "a" });
    expect(handle.data).toBe("hello");
    expect(live.queryClient.getAll()).toHaveLength(1);

    expect(await settle(first)).toEqual(Option.some("hello"));
    expect(live.runs()).toBe(1);
  });

  it("starts with the cached value", async () => {
    const live = setup();
    live.disconnect();
    live.queryClient.setData(message, { id: "a" }, "cached");

    const first = Effect.runPromise(Stream.runHead(watchMessage(live)));

    expect(await settle(first)).toEqual(Option.some("cached"));
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("unsubscribes when interrupted", async () => {
    const live = setup();
    live.disconnect();
    const fiber = Effect.runFork(Stream.runDrain(watchMessage(live)));
    await vi.waitFor(() => {
      expect(live.queryClient.getData(message, { id: "a" })).toBe("hello");
    });

    await Effect.runPromise(Fiber.interrupt(fiber));
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
  });
});
