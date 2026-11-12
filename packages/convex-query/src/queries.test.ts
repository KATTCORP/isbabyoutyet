import type { InfiniteData, InputOf, QueryHandle } from "@raf-query/react";
import {
  createQueryClient,
  fetchPreviousPage,
  getData,
  hasNextPage,
  hasPreviousPage,
  invalidateMany,
  invalidateOne,
  isFetching,
  load,
  retry,
  revalidate,
  swr,
} from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect, expectTypeOf, test } from "vitest";
import { convex } from "./plugin.ts";
import type {
  ConvexPaginatedQueryHandle,
  ConvexQueryHandle,
  PageBefore,
  PageDirection,
  TwoWayPageParam,
} from "./queries.ts";
import { convexPaginatedQuery, convexQuery } from "./queries.ts";
import type { ConvexQueryClient } from "./context.ts";
import type { ConvexWatchClient } from "./reader.ts";
import { subscribingReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

/** A browser client reading through `client`, without gc timers. */
function makeQueryClient(client: ConvexWatchClient) {
  return createQueryClient({
    defaults: { gcTime: Infinity },
    isServer: false,
    plugins: [convex({ live: null, reader: subscribingReader(client) })],
  });
}

const getMessage = makeFunctionReference<"query", { id: string }, string | null>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");
/**
 * A room's messages read both ways, opened at `from` or at the top. In room
 * "lobby" two newer messages sit above every start; in room "quiet" none.
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
const messageFeed = convexPaginatedQuery(listFeed);

/** A query client over a fake backend, and what the backend was asked. */
interface Setup {
  /** Every paged watch, including ones a live subscription answers. */
  readonly pageReads: Array<string>;
  readonly queryClient: ConvexQueryClient;
  /** The name of every query the backend ran. */
  readonly reads: Array<string>;
}

function setup(): Setup {
  const reads: Array<string> = [];
  const pageReads: Array<string> = [];
  const backend = makeTestConvexClient(async (query, args) => {
    reads.push(getFunctionName(query));
    if (getFunctionName(query) === "messages:list") {
      return { continueCursor: "", isDone: true, page: [`${args.room}:hello`] };
    }
    if (getFunctionName(query) === "messages:feed" && args.direction === "forward") {
      const start = args.from ?? "top";
      return {
        before: { count: args.room === "quiet" ? 0 : 2, more: false },
        continueCursor: "",
        isDone: true,
        page: [{ _id: `${args.room}:${start}` }, { _id: `${args.room}:older` }],
      };
    }
    if (getFunctionName(query) === "messages:feed") {
      const first = args.paginationOpts.cursor === null;
      return {
        before: { count: first ? 1 : 0, more: false },
        continueCursor: "newer-1",
        isDone: !first,
        page: [{ _id: first ? `${args.room}:newer-1` : `${args.room}:newer-2` }],
      };
    }
    return args.id === "a" ? "hello" : null;
  });
  // Every watch, including ones a live subscription answers without
  // re-running the query.
  const client: ConvexWatchClient = {
    watchQuery: (query, args) => {
      if ("paginationOpts" in args) {
        const direction = "direction" in args ? ` ${String(args.direction)}` : "";
        pageReads.push(
          `${getFunctionName(query)}${direction} ${args.paginationOpts.cursor ?? "null"}`,
        );
      }
      return backend.client.watchQuery(query, args);
    },
  };
  return { pageReads, queryClient: makeQueryClient(client), reads };
}

test("inline factories infer from the query and share one entry per query and args", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;

  const [handles, data] = await load(queryClient, {
    message: swr(convexQuery(getMessage), { id: "a" }),
  });

  expectTypeOf(handles.message).toEqualTypeOf<ConvexQueryHandle<typeof getMessage>>();
  expect(handles.message).toEqual({
    input: { id: "a" },
    queryKey: ["convexQuery", "messages:get", { id: "a" }],
  });
  expectTypeOf(data.message).toEqualTypeOf<string | null>();
  expect(data.message).toBe("hello");
  expectTypeOf(getData(queryClient, convexQuery(getMessage), { id: "a" })).toEqualTypeOf<
    string | null | undefined
  >();
  expect(convexQuery(getMessage)).toBe(convexQuery(getMessage));
  await load(queryClient, { message: swr(convexQuery(getMessage), { id: "a" }) });
  expect(ctx.reads).toEqual(["messages:get"]);

  // @ts-expect-error — the input is the query's args
  swr(convexQuery(getMessage), { nope: "a" });
});

test("a factory target reaches entries other calls of the factory created", async () => {
  const ctx = setup();
  await load(ctx.queryClient, { message: swr(convexQuery(getMessage), { id: "a" }) });

  await invalidateMany(ctx.queryClient, convexQuery(getMessage));
  const reloading = load(ctx.queryClient, {
    message: revalidate(convexQuery(getMessage), { id: "a" }),
  });

  expect(isFetching(ctx.queryClient, convexQuery(getMessage))).toBe(1);
  await reloading;
});

test("a client without the convex plugin doesn't type-check where it meets a factory", () => {
  const queryClient = createQueryClient({ plugins: [retry()] });
  const wrong = () => {
    void load(queryClient, {
      // @ts-expect-error — this client has no `convex` plugin, so no reader for the queryFn
      message: swr(convexQuery(getMessage), { id: "a" }),
    });
    // @ts-expect-error — the verbs check it too
    void invalidateMany(queryClient, convexQuery(getMessage));
  };
  expectTypeOf(wrong).toBeFunction();
  // `retry` is optional: a client with the plugin alone runs the factories.
  const withoutRetry = makeQueryClient(makeTestConvexClient(async () => null).client);
  expectTypeOf(invalidateMany(withoutRetry, convexQuery(getMessage))).resolves.toBeVoid();
});

test("inline paginated factories infer pages and take the args without paginationOpts", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;

  const [handles, loaded] = await load(queryClient, {
    list: swr(convexPaginatedQuery(listMessages), { args: { room: "lobby" }, numItems: 10 }),
  });

  expectTypeOf(handles.list).toEqualTypeOf<ConvexPaginatedQueryHandle<typeof listMessages>>();
  expectTypeOf(loaded.list).toEqualTypeOf<
    InfiniteData<PaginationResult<string>, PaginationOptions>
  >();
  expect(loaded.list.pages.flatMap((page) => page.page)).toEqual(["lobby:hello"]);

  await load(queryClient, {
    list: swr(
      convexPaginatedQuery(listMessages),
      { args: { room: "lobby" }, numItems: 10 },
      { pages: 2 },
    ),
  });
});

/** A feed's pages, as their item ids. */
function feedIds(
  data: { pages: ReadonlyArray<{ page: ReadonlyArray<{ _id: string }> }> } | undefined,
) {
  return data?.pages.map((page) => page.page.map((item) => item._id));
}

test("two-way factories load pages before the first only on fetchPreviousPage, prepending them", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: null, numItems: 10 };

  const [handles] = await load(queryClient, { feed: swr(messageFeed, input) });
  expectTypeOf(handles.feed).toEqualTypeOf<ConvexPaginatedQueryHandle<typeof listFeed>>();
  expectTypeOf(handles.feed).toExtend<QueryHandle>();
  // Where it starts isn't part of its key.
  expect(handles.feed.queryKey).toEqual([
    "convexPaginatedQuery",
    "messages:feed",
    { room: "lobby" },
    10,
  ]);
  expect(ctx.pageReads).toEqual(["messages:feed forward null"]);
  expect(hasPreviousPage(queryClient, messageFeed, input)).toBe(true);
  expect(hasNextPage(queryClient, messageFeed, input)).toBe(false);

  await fetchPreviousPage(queryClient, messageFeed, input);
  expect(hasPreviousPage(queryClient, messageFeed, input)).toBe(true);
  await fetchPreviousPage(queryClient, messageFeed, input);
  expect(ctx.pageReads).toEqual([
    "messages:feed forward null",
    "messages:feed backward null",
    "messages:feed backward newer-1",
  ]);
  const data = getData(queryClient, messageFeed, input);
  expectTypeOf(data?.pageParams).toEqualTypeOf<ReadonlyArray<TwoWayPageParam> | undefined>();
  expect(feedIds(data)).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:top", "lobby:older"],
  ]);
  const first = {
    cursor: null,
    direction: "forward",
    from: null,
    next: null,
    numItems: 10,
  } as const satisfies TwoWayPageParam;
  const newer = {
    cursor: null,
    direction: "backward",
    from: null,
    next: first,
    numItems: 10,
  } as const satisfies TwoWayPageParam;
  expect(data?.pageParams).toEqual([
    { cursor: "newer-1", direction: "backward", from: null, next: newer, numItems: 10 },
    newer,
    first,
  ]);
  // The top page says nothing is before it.
  expect(hasPreviousPage(queryClient, messageFeed, input)).toBe(false);
});

test("a two-way query whose first page has nothing before it has no previous page", async () => {
  const ctx = setup();
  const input: InputOf<typeof messageFeed> = { args: { room: "quiet" }, from: "m3", numItems: 10 };

  await load(ctx.queryClient, { feed: swr(messageFeed, input) });

  expect(hasPreviousPage(ctx.queryClient, messageFeed, input)).toBe(false);
  await fetchPreviousPage(ctx.queryClient, messageFeed, input);
  expect(ctx.pageReads).toEqual(["messages:feed forward null"]);
});

test("a two-way refetch retraces backward pages backward, then forward, from its start", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const input: InputOf<typeof messageFeed> = { args: { room: "lobby" }, from: "m7", numItems: 10 };
  await load(queryClient, { feed: swr(messageFeed, input) });
  await fetchPreviousPage(queryClient, messageFeed, input);
  await fetchPreviousPage(queryClient, messageFeed, input);
  ctx.pageReads.length = 0;

  // Read through another start it shows: the entry keeps its own.
  const other: InputOf<typeof messageFeed> = { ...input, from: "lobby:older" };
  await invalidateOne(queryClient, messageFeed, other);
  await load(queryClient, { feed: revalidate(messageFeed, other) });

  expect(ctx.pageReads).toEqual([
    "messages:feed backward newer-1",
    "messages:feed backward null",
    "messages:feed forward null",
  ]);
  expect(feedIds(getData(queryClient, messageFeed, input))).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:m7", "lobby:older"],
  ]);
});

test("a load keeps a feed that shows the item, and starts it over at one it doesn't", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const at = (from: string | null): InputOf<typeof messageFeed> => ({
    args: { room: "lobby" },
    from,
    numItems: 10,
  });
  await load(queryClient, { feed: swr(messageFeed, at(null)) });
  ctx.reads.length = 0;

  // An item it shows, and back to where it started: nothing to read.
  await load(queryClient, { feed: swr(messageFeed, at("lobby:older")) });
  await load(queryClient, { feed: swr(messageFeed, at(null)) });
  expect(ctx.reads).toEqual([]);

  // An item it doesn't show starts it over there.
  const [, linked] = await load(queryClient, {
    feed: swr(messageFeed, at("m3")),
  });
  expect(ctx.reads).toEqual(["messages:feed"]);
  expect(feedIds(linked.feed)).toEqual([["lobby:m3", "lobby:older"]]);
  expect(linked.feed.pageParams[0]?.from).toBe("m3");

  // The same link again, even one whose item isn't there, keeps it.
  await load(queryClient, { feed: swr(messageFeed, at("m3")) });
  expect(ctx.reads).toEqual(["messages:feed"]);

  // The top, from a feed that starts at an item, starts over at the top.
  const [, top] = await load(queryClient, {
    feed: swr(messageFeed, at(null)),
  });
  expect(top.feed.pageParams[0]?.from).toBeNull();
  expect(feedIds(top.feed)).toEqual([["lobby:top", "lobby:older"]]);
});
