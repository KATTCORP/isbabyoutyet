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
  BidirectionalPageParam,
  ConvexBidirectionalPaginatedQueryHandle,
  ConvexPaginatedQueryHandle,
  ConvexQueryHandle,
} from "./queries.ts";
import {
  convexBidirectionalPaginatedQuery,
  convexPaginatedQuery,
  convexQuery,
  loadBidirectionalPaginatedQuery,
} from "./queries.ts";
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
const listNewerMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string> & { newer: true }
>("messages:listNewer");

function setup() {
  const reads: Array<string> = [];
  const pageReads: Array<string> = [];
  const backend = makeTestConvexClient(async (query, args) => {
    reads.push(getFunctionName(query));
    if (getFunctionName(query) === "messages:list") {
      return { continueCursor: "", isDone: true, page: [`${args.room}:hello`] };
    }
    if (getFunctionName(query) === "messages:listNewer") {
      const first = args.paginationOpts.cursor === null;
      return {
        continueCursor: "newer-1",
        isDone: !first,
        newer: true,
        page: [first ? `${args.room}:newer-1` : `${args.room}:newer-2`],
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

test("two-way factories load backward pages only on fetchPreviousPage, prepending them", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const around = convexBidirectionalPaginatedQuery({
    backward: listNewerMessages,
    forward: listMessages,
  });
  const input = { args: { room: "lobby" }, numItems: 10 };

  const [handles] = await load(queryClient, { around: swr(around, input) });
  expectTypeOf(handles.around).toEqualTypeOf<
    ConvexBidirectionalPaginatedQueryHandle<typeof listMessages, typeof listNewerMessages>
  >();
  expectTypeOf(handles.around).toExtend<QueryHandle>();
  expect(ctx.reads).toEqual(["messages:list"]);
  expect(hasPreviousPage(queryClient, around, input)).toBe(true);
  expect(hasNextPage(queryClient, around, input)).toBe(false);

  await fetchPreviousPage(queryClient, around, input);
  await fetchPreviousPage(queryClient, around, input);
  expect(ctx.reads).toEqual(["messages:list", "messages:listNewer", "messages:listNewer"]);
  const data = getData(queryClient, around, input);
  expectTypeOf(data?.pageParams).toEqualTypeOf<ReadonlyArray<BidirectionalPageParam> | undefined>();
  expect(data?.pages.map((page) => page.page)).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:hello"],
  ]);
  const first = { cursor: null, direction: "forward", next: null, numItems: 10 } as const;
  const newer = { cursor: null, direction: "backward", next: first, numItems: 10 } as const;
  expect(data?.pageParams).toEqual([
    { cursor: "newer-1", direction: "backward", next: newer, numItems: 10 },
    newer,
    first,
  ]);
  expect(hasPreviousPage(queryClient, around, input)).toBe(false);
});

/** A two-way backend over real cursors: `older` from the start, `newer` nearest first. */
function setupAround() {
  const older = ["a", "b", "c"];
  const newer = ["n1", "n2", "n3", "n4", "n5"];
  const events: Array<string> = [];
  const paginate = (items: ReadonlyArray<string>, opts: PaginationOptions) => {
    const start = opts.cursor === null ? 0 : items.indexOf(opts.cursor) + 1;
    const page = items.slice(start, start + opts.numItems);
    return {
      continueCursor: page.at(-1) ?? "",
      isDone: start + opts.numItems >= items.length,
      page,
    };
  };
  const backend = makeTestConvexClient(async (query, args) => {
    const read = `${getFunctionName(query)} ${args.paginationOpts.cursor ?? "null"}/${args.paginationOpts.numItems}`;
    events.push(`start ${read}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    events.push(`end ${read}`);
    return getFunctionName(query) === "messages:list"
      ? paginate(older, args.paginationOpts)
      : { ...paginate(newer, args.paginationOpts), newer: true };
  });
  // Every watch, including ones a live subscription answers without
  // re-running the query.
  const watches: Array<string> = [];
  const client: ConvexWatchClient = {
    watchQuery: (query, args) => {
      if ("paginationOpts" in args) {
        const opts = args.paginationOpts;
        watches.push(`${getFunctionName(query)} ${opts.cursor ?? "null"}/${opts.numItems}`);
      }
      return backend.client.watchQuery(query, args);
    },
  };
  const queryClient = makeQueryClient(client);
  const queries = { backward: listNewerMessages, forward: listMessages };
  return {
    around: convexBidirectionalPaginatedQuery(queries),
    events,
    input: { args: { room: "lobby" }, numItems: 3 },
    newer,
    queries,
    queryClient,
    watches,
  };
}

test("a two-way load reads a short first backward page alongside the first page", async () => {
  const ctx = setupAround();

  const [handle, data] = await loadBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });

  expectTypeOf(handle).toEqualTypeOf<
    ConvexBidirectionalPaginatedQueryHandle<typeof listMessages, typeof listNewerMessages>
  >();
  expect(handle.input).toEqual(ctx.input);
  expect(ctx.events.slice(0, 2).toSorted()).toEqual([
    "start messages:list null/3",
    "start messages:listNewer null/2",
  ]);
  expect(data.pages.map((page) => page.page)).toEqual([
    ["n1", "n2"],
    ["a", "b", "c"],
  ]);
  const first = { cursor: null, direction: "forward", next: null, numItems: 3 } as const;
  const context = { cursor: null, direction: "backward", next: first, numItems: 2 } as const;
  expect(data.pageParams).toEqual([context, first]);
  expect(getData(ctx.queryClient, ctx.around, ctx.input)).toEqual(data);
  // The short page's own read leaves the cache once it's folded into the feed.
  expect(
    getData(ctx.queryClient, convexQuery(listNewerMessages), {
      paginationOpts: { cursor: null, numItems: 2 },
      room: "lobby",
    }),
  ).toBeUndefined();

  // Past the short page, backward pages are full again.
  await fetchPreviousPage(ctx.queryClient, ctx.around, ctx.input);
  expect(ctx.events.at(-1)).toBe("end messages:listNewer n2/3");
  expect(getData(ctx.queryClient, ctx.around, ctx.input)?.pageParams[0]).toEqual({
    cursor: "n2",
    direction: "backward",
    next: context,
    numItems: 3,
  });
  expect(hasPreviousPage(ctx.queryClient, ctx.around, ctx.input)).toBe(false);
});

test("a two-way load keeps the backward pages an entry already has", async () => {
  const ctx = setupAround();
  const opts = { input: ctx.input, previousNumItems: 2, queries: ctx.queries };
  await loadBidirectionalPaginatedQuery(ctx.queryClient, opts);
  await fetchPreviousPage(ctx.queryClient, ctx.around, ctx.input);
  ctx.events.length = 0;

  const [, data] = await loadBidirectionalPaginatedQuery(ctx.queryClient, opts);

  expect(ctx.events).toEqual([]);
  expect(data.pages.map((page) => page.page)).toEqual([
    ["n3", "n4", "n5"],
    ["n1", "n2"],
    ["a", "b", "c"],
  ]);
});

test("two concurrent two-way loads seed the short backward page once", async () => {
  const ctx = setupAround();
  const opts = { input: ctx.input, previousNumItems: 2, queries: ctx.queries };

  const loaded = await Promise.all([
    loadBidirectionalPaginatedQuery(ctx.queryClient, opts),
    loadBidirectionalPaginatedQuery(ctx.queryClient, opts),
  ]);

  for (const [, data] of loaded) {
    expect(data.pages.map((page) => page.page)).toEqual([
      ["n1", "n2"],
      ["a", "b", "c"],
    ]);
  }
  expect(getData(ctx.queryClient, ctx.around, ctx.input)?.pageParams).toHaveLength(2);
});

test("a two-way load with nothing before the start has no previous page", async () => {
  const ctx = setupAround();
  ctx.newer.length = 0;

  const [, data] = await loadBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });

  expect(data.pages.map((page) => page.page)).toEqual([[], ["a", "b", "c"]]);
  expect(hasPreviousPage(ctx.queryClient, ctx.around, ctx.input)).toBe(false);
});

test("a two-way refetch retraces a short first backward page at its own size", async () => {
  const ctx = setupAround();
  await loadBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });
  await fetchPreviousPage(ctx.queryClient, ctx.around, ctx.input);
  ctx.watches.length = 0;

  await invalidateOne(ctx.queryClient, ctx.around, ctx.input);
  await load(ctx.queryClient, { around: revalidate(ctx.around, ctx.input) });

  expect(ctx.watches).toEqual([
    "messages:listNewer n2/3",
    "messages:listNewer null/2",
    "messages:list null/3",
  ]);
  expect(getData(ctx.queryClient, ctx.around, ctx.input)?.pages.map((page) => page.page)).toEqual([
    ["n3", "n4", "n5"],
    ["n1", "n2"],
    ["a", "b", "c"],
  ]);
});

test("a two-way refetch retraces backward pages with the backward query, then forward", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const around = convexBidirectionalPaginatedQuery({
    backward: listNewerMessages,
    forward: listMessages,
  });
  const input = { args: { room: "lobby" }, numItems: 10 };
  await load(queryClient, { around: swr(around, input) });
  await fetchPreviousPage(queryClient, around, input);
  await fetchPreviousPage(queryClient, around, input);
  ctx.pageReads.length = 0;

  await invalidateOne(queryClient, around, input);
  await load(queryClient, { around: revalidate(around, input) });

  expect(ctx.pageReads).toEqual([
    "messages:listNewer newer-1",
    "messages:listNewer null",
    "messages:list null",
  ]);
  expect(getData(queryClient, around, input)?.pages.map((page) => page.page)).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:hello"],
  ]);
});
