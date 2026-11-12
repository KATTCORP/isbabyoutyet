import { mount } from "@raf-query/core/internal";
import type { InputOf, LoadEntry, LoadEntryOptions, QueryFactory } from "@raf-query/react";
import {
  bindQueryOptions,
  createQueryClient,
  fetchNextPage,
  fetchPreviousPage,
  hasPreviousPage,
  getData,
  invalidateOne,
  load,
  removeOne,
  revalidate,
  setData,
  swr,
} from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { isInvalidatedEntry } from "./test-cache.ts";
import type { ConvexQueryClient } from "./context.ts";
import type { ConvexWatchClient } from "./reader.ts";
import { watchConvexQuery } from "./live.ts";
import { convex } from "./plugin.ts";
import { CONVEX_PAGINATED_QUERY_KEY, CONVEX_QUERY_KEY } from "./entries.ts";
import type { PageBefore, PageDirection, PaginationArgs } from "./queries.ts";
import { convexPaginatedQuery, convexQuery } from "./queries.ts";
import { subscribingReader } from "./reader.ts";
import type { TestConvexClient } from "./testing.ts";
import { makeTestConvexClient } from "./testing.ts";

/** For queries of the tests' own: bound to no plugin, so they run on any client. */
const queryOptions = bindQueryOptions();

/**
 * Refetch every page now, as `useInfiniteQuery`'s `refetch()` does. Convex
 * queries never go stale, so `revalidate` alone would keep the cached pages.
 */
async function refetchAll(
  queryClient: ConvexQueryClient,
  query: { factory: typeof messageList; input: InputOf<typeof messageList> },
) {
  await invalidateOne(queryClient, query.factory, query.input);
  await load(queryClient, { pages: revalidate(query.factory, query.input) });
}

const getMessage = makeFunctionReference<"query", { id: string }, string>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");

/**
 * The same messages read both ways: forward pages read `items`, backward
 * pages read `newer`, and each page says how many newer ones are before it.
 */
const listFeed = makeFunctionReference<
  "query",
  {
    direction: PageDirection;
    from: string | null;
    paginationOpts: PaginationOptions;
    room: string;
  },
  PaginationResult<{ _id: string }> & { before: PageBefore | null }
>("messages:feed");

const message = convexQuery(getMessage);
const messageList = convexPaginatedQuery(listMessages);
const messageFeed = convexPaginatedQuery(listFeed);

/** A feed's page of `ids`, as items. */
function feedPage(result: PaginationResult<string>): PaginationResult<{ _id: string }> {
  return { ...result, page: result.page.map((id) => ({ _id: id })) };
}

/** A feed's pages, as their item ids. */
function feedIds(
  data: { pages: ReadonlyArray<{ page: ReadonlyArray<{ _id: string }> }> } | undefined,
) {
  return data?.pages.map((page) => page.page.map((item) => item._id));
}

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

/** A read of a page, held until the test releases it. */
interface HeldRead {
  /** Resolves once a read is held. */
  readonly reached: Promise<void>;
  release(): void;
}

/** A mounted query client over a fake backend the test edits and refreshes. */
interface Setup {
  readonly backend: TestConvexClient;
  readonly client: ConvexWatchClient;
  /** Stop the live sync, as unmounting the provider does. */
  disconnect(): void;
  /** Make every later read fail. */
  fail(): void;
  /**
   * Hold the response to reads of the unpinned page starting after `cursor`
   * (`"null"` for the first) until `release` is called. The page is read
   * before it is held; `reached` resolves once a read is held.
   */
  hold(cursor: string): HeldRead;
  readonly items: Array<string>;
  /** A loader's `swr`: resolves once the entry has data, read now unless cached. */
  load<TFactory extends QueryFactory>(
    factory: TFactory,
    ...args: [input?: Parameters<TFactory>[0], options?: LoadEntryOptions]
  ): Promise<void>;
  readonly messages: Map<string, string>;
  readonly newer: Array<string>;
  readonly queryClient: ConvexQueryClient;
  /** How many times the backend ran a query. */
  runs(): number;
}

function setup(): Setup {
  vi.useFakeTimers();
  const messages = new Map([["a", "hello"]]);
  const items = ["a", "b", "c", "d", "e"];
  /** Newer than `items`, nearest first: the backward direction of `messageFeed`. */
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
      case "messages:feed": {
        if (args.direction === "forward") {
          const before =
            args.paginationOpts.cursor === null ? { count: newer.length, more: false } : null;
          return { ...feedPage(paginate(items, args.paginationOpts)), before };
        }
        const result = paginate(newer, args.paginationOpts);
        const last = result.page.at(-1);
        const left = last === undefined ? 0 : newer.length - newer.indexOf(last) - 1;
        return { ...feedPage(result), before: { count: left, more: false } };
      }
      default: {
        throw new Error("Unknown query");
      }
    }
  });
  const queryClient = createQueryClient({
    defaults: { gcTime: Infinity },
    isServer: false,
    plugins: [convex({ live: backend.client, reader: subscribingReader(backend.client) })],
  });
  // What `QueryClientProvider` does while mounted.
  const disconnect = mount(queryClient);
  onTestFinished(() => {
    disconnect();
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
    /** A loader's `swr`: resolves once the entry has data, read now unless cached. */
    load: async <TFactory extends QueryFactory>(
      factory: TFactory,
      ...args: [input?: Parameters<TFactory>[0], options?: LoadEntryOptions]
    ) => {
      // SAFETY: `swr` takes the factory's input, which `args` passes on.
      const entry: LoadEntry = swr(factory, ...(args as [never]));
      await load(queryClient, { entry });
    },
    messages,
    newer,
    queryClient,
    /** How many times the backend ran a query. */
    runs: () => runs,
  };
}

describe("the convex plugin's live sync", () => {
  it("writes every result of a cached query into the cache", async () => {
    const live = setup();
    await live.load(message, { id: "a" });
    expect(getData(live.queryClient, message, { id: "a" })).toBe("hello");

    live.messages.set("a", "edited");
    await live.backend.refresh();
    expect(getData(live.queryClient, message, { id: "a" })).toBe("edited");
  });

  it("unsubscribes when the entry leaves the cache", async () => {
    const live = setup();
    await live.load(message, { id: "a" });
    // The read's own subscription lapses; the live one remains.
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([{ args: { id: "a" }, name: "messages:get" }]);

    removeOne(live.queryClient, message, { id: "a" });
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("pins every page but the last, so items added inside a page stay on it", async () => {
    const live = setup();
    const factory = messageList;
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(factory, input, { pages: 2 });
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
    const data = getData(live.queryClient, factory, input);
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
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(factory, input);
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual([
      { paginationOpts: { cursor: null, numItems: 2 }, room: "lobby" },
    ]);

    await fetchNextPage(live.queryClient, factory, input);
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
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(messageList, input, { pages: 2 });

    const { release } = live.hold("d");
    const nextPage = fetchNextPage(live.queryClient, messageList, input);
    live.items.unshift("new");
    // The held page's subscription re-runs too, so this settles on release.
    const refreshed = live.backend.refresh();
    await vi.waitFor(() => {
      expect(getData(live.queryClient, messageList, input)?.pages[0]?.page).toEqual([
        "new",
        "a",
        "b",
      ]);
    });

    release();
    await Promise.all([nextPage, refreshed]);
    await vi.waitFor(() => {
      expect(getData(live.queryClient, messageList, input)?.pages.map((page) => page.page)).toEqual(
        [["new", "a", "b"], ["c", "d"], ["e"]],
      );
    });
  });

  it("keeps a page update that lands while every page refetches", async () => {
    const live = setup();
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(messageList, input, { pages: 2 });
    // The reads' own subscriptions lapse, so the refetch reads the backend.
    vi.advanceTimersByTime(5000);

    // The refetch reads the first page before this insert, and lands after it.
    const firstPage = live.hold("null");
    const refetch = refetchAll(live.queryClient, { factory: messageList, input });
    await firstPage.reached;
    live.items.unshift("new");
    const refreshed = live.backend.refresh();
    await vi.waitFor(() => {
      expect(getData(live.queryClient, messageList, input)?.pages[0]?.page).toEqual([
        "new",
        "a",
        "b",
      ]);
    });

    firstPage.release();
    await Promise.all([refetch, refreshed]);
    // raf-query keeps the page written after the refetch read it.
    expect(getData(live.queryClient, messageList, input)?.pages.map((page) => page.page)).toEqual([
      ["new", "a", "b"],
      ["c", "d"],
    ]);
  });

  it("follows the page boundaries a refetch moves", async () => {
    const live = setup();
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(messageList, input, { pages: 2 });
    vi.advanceTimersByTime(5000);

    live.items.shift();
    await refetchAll(live.queryClient, { factory: messageList, input });
    vi.advanceTimersByTime(5000);
    expect(getData(live.queryClient, messageList, input)?.pages.map((page) => page.page)).toEqual([
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
    const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: null, numItems: 2 };
    await live.load(messageFeed, input, { pages: 2 });
    await fetchPreviousPage(live.queryClient, messageFeed, input);
    await fetchPreviousPage(live.queryClient, messageFeed, input);
    vi.advanceTimersByTime(5000);

    const byDirection = (direction: PageDirection) =>
      live.backend
        .subscriptions()
        .filter((subscription) => subscription.args.direction === direction)
        .map((subscription) => subscription.args);
    expect(byDirection("forward")).toEqual(
      expect.arrayContaining([
        {
          direction: "forward",
          from: null,
          paginationOpts: { cursor: null, endCursor: "b", numItems: 2 },
          room: "lobby",
        },
        {
          direction: "forward",
          from: null,
          paginationOpts: { cursor: "b", numItems: 2 },
          room: "lobby",
        },
      ]),
    );
    expect(byDirection("backward")).toEqual(
      expect.arrayContaining([
        {
          direction: "backward",
          from: null,
          paginationOpts: { cursor: null, endCursor: "n2", numItems: 2 },
          room: "lobby",
        },
        {
          direction: "backward",
          from: null,
          paginationOpts: { cursor: "n2", numItems: 2 },
          room: "lobby",
        },
      ]),
    );
    expect(live.backend.subscriptions()).toHaveLength(4);

    // Inside the pinned newer page, and past the full top page: the first
    // grows in place, the other stays out until the next fetch.
    live.newer.unshift("n0");
    live.newer.push("n5");
    await live.backend.refresh();
    const data = getData(live.queryClient, messageFeed, input);
    expect(feedIds(data)).toEqual([
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

  it("follows what's before a two-way query's top page as it changes", async () => {
    const live = setup();
    live.newer.length = 0;
    const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: null, numItems: 2 };
    await live.load(messageFeed, input);
    vi.advanceTimersByTime(5000);
    expect(hasPreviousPage(live.queryClient, messageFeed, input)).toBe(false);

    // Posted above the feed while it's on screen.
    live.newer.push("n1");
    await live.backend.refresh();

    expect(getData(live.queryClient, messageFeed, input)?.pages[0]?.before).toEqual({
      count: 1,
      more: false,
    });
    expect(hasPreviousPage(live.queryClient, messageFeed, input)).toBe(true);
  });

  it("subscribes a two-way query's pages from where they start, whatever start reads it", async () => {
    const live = setup();
    const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: "b", numItems: 2 };
    await live.load(messageFeed, input);
    // Another start it shows reads the same entry: the key leaves `from` out.
    await live.load(messageFeed, { ...input, from: "a" });
    vi.advanceTimersByTime(5000);

    expect(live.backend.subscriptions().map((subscription) => subscription.args)).toEqual([
      {
        direction: "forward",
        from: "b",
        paginationOpts: { cursor: null, numItems: 2 },
        room: "lobby",
      },
    ]);
  });

  it("invalidates the entry when its subscription fails", async () => {
    const live = setup();
    await live.load(message, { id: "a" });
    live.fail();
    await live.backend.refresh();
    expect(isInvalidatedEntry(live.queryClient, { factory: message, input: { id: "a" } })).toBe(
      true,
    );
    expect(getData(live.queryClient, message, { id: "a" })).toBe("hello");
  });

  it("invalidates a paged entry when a page subscription fails", async () => {
    const live = setup();
    const input: InputOf<typeof messageList> = { args: { room: "lobby" }, numItems: 2 };
    await live.load(messageList, input);
    live.fail();
    await live.backend.refresh();
    expect(isInvalidatedEntry(live.queryClient, { factory: messageList, input })).toBe(true);
    expect(getData(live.queryClient, messageList, input)?.pages[0]?.page).toEqual(["a", "b"]);
  });

  it("invalidates a two-way entry when a page subscription fails", async () => {
    const live = setup();
    const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: null, numItems: 2 };
    await live.load(messageFeed, input);
    await fetchPreviousPage(live.queryClient, messageFeed, input);
    live.fail();
    await live.backend.refresh();
    expect(isInvalidatedEntry(live.queryClient, { factory: messageFeed, input })).toBe(true);
    expect(feedIds(getData(live.queryClient, messageFeed, input))).toEqual([
      ["n1", "n2"],
      ["a", "b"],
    ]);
  });

  it("leaves entries that aren't Convex queries alone", async () => {
    const live = setup();
    const other = (id: string) =>
      queryOptions({ queryFn: async () => id, queryKey: [CONVEX_QUERY_KEY, id] });
    await live.load(other, "a");
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("leaves entries with malformed Convex keys or page params alone", async () => {
    const live = setup();
    const args: PaginationArgs<typeof listMessages> = { room: "lobby" };
    const page: PaginationResult<string> = {
      continueCursor: "b",
      isDone: false,
      page: ["a", "b"],
    };
    const entries: ReadonlyArray<{ data: unknown; key: ReadonlyArray<unknown> }> = [
      { data: "x", key: [CONVEX_QUERY_KEY, 1, args] },
      { data: "x", key: ["other", "messages:get", args] },
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
      {
        data: {
          pageParams: [{ cursor: null, direction: "forward", from: 8, next: null, numItems: 2 }],
          pages: [page],
        },
        key: [CONVEX_PAGINATED_QUERY_KEY, "messages:feed", args, 8],
      },
    ];
    for (const entry of entries) {
      const options = () =>
        queryOptions({ queryFn: async () => entry.data, queryKey: [...entry.key] });
      await live.load(options);
    }
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("subscribes entries that were cached before it connected, until disconnected", async () => {
    const live = setup();
    live.disconnect();
    await live.load(message, { id: "a" });
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);

    const disconnect = mount(live.queryClient);
    expect(live.backend.subscriptions()).toHaveLength(1);
    disconnect();
    expect(live.backend.subscriptions()).toEqual([]);
  });
});

describe("watchConvexQuery", () => {
  /** A watch of message "a": the values it has reported, and the function that stops it. */
  interface Watching {
    stop(): void;
    readonly values: Array<string>;
  }

  /** Watch message "a", collecting its values until the test stops it. */
  function watchMessage(live: Setup): Watching {
    const values: Array<string> = [];
    const stop = watchConvexQuery(live, {
      args: { id: "a" },
      onValue: (value) => {
        values.push(value);
      },
      query: getMessage,
    });
    return { stop, values };
  }

  it("subscribes itself and reports each new result", async () => {
    const live = setup();
    live.disconnect();
    const watching = watchMessage(live);
    await vi.waitFor(() => {
      expect(getData(live.queryClient, message, { id: "a" })).toBe("hello");
    });

    await live.backend.refresh();
    live.messages.set("a", "edited");
    await live.backend.refresh();
    expect(watching.values).toEqual(["hello", "edited"]);
    expect(getData(live.queryClient, message, { id: "a" })).toBe("edited");
    watching.stop();
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("shares the entry and its read with a loader's load", async () => {
    const live = setup();
    const watching = watchMessage(live);
    await live.load(message, { id: "a" });
    expect(live.queryClient["~entries"].size).toBe(1);

    await vi.waitFor(() => {
      expect(watching.values).toEqual(["hello"]);
    });
    expect(live.runs()).toBe(1);
    watching.stop();
  });

  it("starts with the cached value", () => {
    const live = setup();
    live.disconnect();
    setData(live.queryClient, message, { id: "a" }, "cached");

    const watching = watchMessage(live);

    expect(watching.values).toEqual(["cached"]);
    watching.stop();
    expect(live.backend.subscriptions()).toEqual([]);
  });

  it("unsubscribes when stopped", async () => {
    const live = setup();
    live.disconnect();
    const watching = watchMessage(live);
    await vi.waitFor(() => {
      expect(getData(live.queryClient, message, { id: "a" })).toBe("hello");
    });

    watching.stop();
    vi.advanceTimersByTime(5000);
    expect(live.backend.subscriptions()).toEqual([]);
  });
});
