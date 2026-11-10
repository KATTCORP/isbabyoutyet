import type { InfiniteData, QueryHandle } from "@raf-query/react";
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
  revalidate,
  swr,
} from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect, expectTypeOf, test } from "vitest";
import { convexLink } from "./link.ts";
import type {
  ConvexFeedQueryHandle,
  ConvexPaginatedQueryHandle,
  ConvexQueryHandle,
  FeedPageParam,
} from "./queries.ts";
import { convexFeedQuery, convexPaginatedQuery, convexQuery, openFeed } from "./queries.ts";
import type { ConvexWatchClient } from "./reader.ts";
import { ConvexReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

/** A browser client reading through `client`, without gc timers. */
function makeQueryClient(client: ConvexWatchClient) {
  return createQueryClient({
    gcTime: Infinity,
    isServer: false,
    links: [convexLink(ConvexReader.subscribing(client))],
  });
}

const getMessage = makeFunctionReference<"query", { id: string }, string | null>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");
/** A room's messages as a feed, opened at `from` or at the top. */
const listFeed = makeFunctionReference<
  "query",
  { from: string | null; paginationOpts: PaginationOptions; room: string },
  PaginationResult<{ _id: string }>
>("messages:feed");
const listFeedNewer = makeFunctionReference<
  "query",
  { from: string | null; paginationOpts: PaginationOptions; room: string },
  PaginationResult<{ _id: string }> & { newer: true }
>("messages:feedNewer");
const messageFeed = convexFeedQuery({ backward: listFeedNewer, forward: listFeed });

function setup() {
  const reads: Array<string> = [];
  const pageReads: Array<string> = [];
  const backend = makeTestConvexClient(async (query, args) => {
    reads.push(getFunctionName(query));
    if (getFunctionName(query) === "messages:list") {
      return { continueCursor: "", isDone: true, page: [`${args.room}:hello`] };
    }
    if (getFunctionName(query) === "messages:feed") {
      const start = args.from ?? "top";
      return {
        continueCursor: "",
        isDone: true,
        page: [{ _id: `${args.room}:${start}` }, { _id: `${args.room}:older` }],
      };
    }
    if (getFunctionName(query) === "messages:feedNewer") {
      const first = args.paginationOpts.cursor === null;
      return {
        continueCursor: "newer-1",
        isDone: !first,
        newer: true,
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
        pageReads.push(`${getFunctionName(query)} ${args.paginationOpts.cursor ?? "null"}`);
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

test("a client without the reader link fails its Convex queries with a hint", async () => {
  const queryClient = createQueryClient({ gcTime: Infinity, isServer: false });

  await expect(
    load(queryClient, { message: swr(convexQuery(getMessage), { id: "a" }) }),
  ).rejects.toThrow("create its QueryClient with the convexLink link");
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

test("feeds load newer pages only on fetchPreviousPage, prepending them", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const input = { args: { room: "lobby" }, from: null, numItems: 10 };

  const [handles] = await load(queryClient, { feed: swr(messageFeed, input) });
  expectTypeOf(handles.feed).toEqualTypeOf<
    ConvexFeedQueryHandle<typeof listFeed, typeof listFeedNewer>
  >();
  expectTypeOf(handles.feed).toExtend<QueryHandle>();
  // Where it starts isn't part of its key.
  expect(handles.feed.queryKey).toEqual([
    "convexFeedQuery",
    "messages:feed",
    "messages:feedNewer",
    { room: "lobby" },
    10,
  ]);
  expect(ctx.reads).toEqual(["messages:feed"]);
  expect(hasPreviousPage(queryClient, messageFeed, input)).toBe(true);
  expect(hasNextPage(queryClient, messageFeed, input)).toBe(false);

  await fetchPreviousPage(queryClient, messageFeed, input);
  await fetchPreviousPage(queryClient, messageFeed, input);
  expect(ctx.reads).toEqual(["messages:feed", "messages:feedNewer", "messages:feedNewer"]);
  const data = getData(queryClient, messageFeed, input);
  expectTypeOf(data?.pageParams).toEqualTypeOf<ReadonlyArray<FeedPageParam> | undefined>();
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
  } as const;
  const newer = {
    cursor: null,
    direction: "backward",
    from: null,
    next: first,
    numItems: 10,
  } as const;
  expect(data?.pageParams).toEqual([
    { cursor: "newer-1", direction: "backward", from: null, next: newer, numItems: 10 },
    newer,
    first,
  ]);
  expect(hasPreviousPage(queryClient, messageFeed, input)).toBe(false);
});

test("a feed refetch retraces newer pages with the backward query, then forward, from its start", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const input = { args: { room: "lobby" }, from: "m7", numItems: 10 };
  await load(queryClient, { feed: swr(messageFeed, input) });
  await fetchPreviousPage(queryClient, messageFeed, input);
  await fetchPreviousPage(queryClient, messageFeed, input);
  ctx.pageReads.length = 0;

  // Read through another start: the entry keeps its own.
  const other = { ...input, from: "m9" };
  await invalidateOne(queryClient, messageFeed, other);
  await load(queryClient, { feed: revalidate(messageFeed, other) });

  expect(ctx.pageReads).toEqual([
    "messages:feedNewer newer-1",
    "messages:feedNewer null",
    "messages:feed null",
  ]);
  expect(feedIds(getData(queryClient, messageFeed, input))).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:m7", "lobby:older"],
  ]);
});

test("openFeed keeps a feed that shows the item, and starts over at one it doesn't", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const at = (from: string | null) => ({ args: { room: "lobby" }, from, numItems: 10 });
  await load(queryClient, { feed: openFeed(queryClient, swr(messageFeed, at(null))) });
  ctx.reads.length = 0;

  // An item it shows, and back to where it started: nothing to read.
  await load(queryClient, { feed: openFeed(queryClient, swr(messageFeed, at("lobby:older"))) });
  await load(queryClient, { feed: openFeed(queryClient, swr(messageFeed, at(null))) });
  expect(ctx.reads).toEqual([]);

  // An item it doesn't show starts it over there.
  const [, linked] = await load(queryClient, {
    feed: openFeed(queryClient, swr(messageFeed, at("m3"))),
  });
  expect(ctx.reads).toEqual(["messages:feed"]);
  expect(feedIds(linked.feed)).toEqual([["lobby:m3", "lobby:older"]]);
  expect(linked.feed.pageParams[0]?.from).toBe("m3");

  // The same link again, even one whose item isn't there, keeps it.
  await load(queryClient, { feed: openFeed(queryClient, swr(messageFeed, at("m3"))) });
  expect(ctx.reads).toEqual(["messages:feed"]);

  // The top, from a feed that starts at an item, starts over at the top.
  const [, top] = await load(queryClient, {
    feed: openFeed(queryClient, swr(messageFeed, at(null))),
  });
  expect(top.feed.pageParams[0]?.from).toBeNull();
  expect(feedIds(top.feed)).toEqual([["lobby:top", "lobby:older"]]);
});
