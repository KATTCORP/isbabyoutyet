import type { InfiniteData } from "@raf-query/react";
import { Query, QueryClient } from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { Effect } from "effect";
import { expect, expectTypeOf, onTestFinished, test } from "vitest";
import type {
  BidirectionalPageParam,
  EnsuredConvexBidirectionalPaginatedQuery,
  EnsuredConvexPaginatedQuery,
  EnsuredConvexQuery,
} from "./queries.ts";
import {
  convexBidirectionalPaginatedQuery,
  convexPaginatedQuery,
  convexQuery,
  ensureBidirectionalPaginatedQuery,
} from "./queries.ts";
import type { ConvexWatchClient } from "./reader.ts";
import { ConvexReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

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
  const queryClient = new QueryClient({
    isServer: false,
    layer: ConvexReader.layerWatch(client),
  });
  onTestFinished(() => queryClient.dispose());
  return { pageReads, queryClient, reads };
}

test("inline factories infer from the query and share one entry per query and args", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;

  const handle = await queryClient.ensure(convexQuery(getMessage), { id: "a" });

  expectTypeOf(handle).toEqualTypeOf<EnsuredConvexQuery<typeof getMessage>>();
  expect(handle).toMatchObject({ data: "hello", input: { id: "a" } });
  expectTypeOf(queryClient.getData(convexQuery(getMessage), { id: "a" })).toEqualTypeOf<
    string | null | undefined
  >();
  expect(queryClient.getData(convexQuery(getMessage), { id: "a" })).toBe("hello");
  await queryClient.ensure(convexQuery(getMessage), { id: "a" });
  expect(ctx.reads).toEqual(["messages:get"]);

  // @ts-expect-error — the input is the query's args
  await queryClient.ensure(convexQuery(getMessage), { nope: "a" }).catch(() => null);
});

test("inline paginated factories infer pages and take the args without paginationOpts", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;

  const handle = await queryClient.ensure(convexPaginatedQuery(listMessages), {
    args: { room: "lobby" },
    numItems: 10,
  });

  expectTypeOf(handle).toEqualTypeOf<EnsuredConvexPaginatedQuery<typeof listMessages>>();
  const data = queryClient.getData(convexPaginatedQuery(listMessages), {
    args: { room: "lobby" },
    numItems: 10,
  });
  expectTypeOf(data).toEqualTypeOf<
    InfiniteData<{ page: PaginationResult<string>; pageParam: PaginationOptions }> | undefined
  >();
  expect(data?.pages.flatMap((page) => page.page)).toEqual(["lobby:hello"]);

  await queryClient.ensure(
    convexPaginatedQuery(listMessages),
    { args: { room: "lobby" }, numItems: 10 },
    { pages: 2 },
  );
});

test("two-way factories load backward pages only on fetchPreviousPage, prepending them", async () => {
  const ctx = setup();
  const queryClient = ctx.queryClient;
  const around = convexBidirectionalPaginatedQuery({
    backward: listNewerMessages,
    forward: listMessages,
  });
  const input = { args: { room: "lobby" }, numItems: 10 };

  const handle = await queryClient.ensure(around, input);
  expectTypeOf(handle).toEqualTypeOf<
    EnsuredConvexBidirectionalPaginatedQuery<typeof listMessages, typeof listNewerMessages>
  >();
  expect(ctx.reads).toEqual(["messages:list"]);
  const query = queryClient.getQuery(around, input);
  expect(Query.hasPreviousPageUnsafe(query)).toBe(true);
  expect(Query.hasNextPageUnsafe(query)).toBe(false);

  await Effect.runPromise(Query.fetchPreviousPage(query));
  await Effect.runPromise(Query.fetchPreviousPage(query));
  expect(ctx.reads).toEqual(["messages:list", "messages:listNewer", "messages:listNewer"]);
  const data = queryClient.getData(around, input);
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
  expect(Query.hasPreviousPageUnsafe(query)).toBe(false);
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
  const queryClient = new QueryClient({ isServer: false, layer: ConvexReader.layerWatch(client) });
  onTestFinished(() => queryClient.dispose());
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

test("a two-way ensure reads a short first backward page alongside the first page", async () => {
  const ctx = setupAround();

  const handle = await ensureBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });

  expectTypeOf(handle).toEqualTypeOf<
    EnsuredConvexBidirectionalPaginatedQuery<typeof listMessages, typeof listNewerMessages>
  >();
  expect(ctx.events.slice(0, 2).toSorted()).toEqual([
    "start messages:list null/3",
    "start messages:listNewer null/2",
  ]);
  expect(handle.data.pages.map((page) => page.page)).toEqual([
    ["n1", "n2"],
    ["a", "b", "c"],
  ]);
  const first = { cursor: null, direction: "forward", next: null, numItems: 3 } as const;
  const context = { cursor: null, direction: "backward", next: first, numItems: 2 } as const;
  expect(handle.data.pageParams).toEqual([context, first]);

  // Past the short page, backward pages are full again.
  const query = ctx.queryClient.getQuery(ctx.around, ctx.input);
  await Effect.runPromise(Query.fetchPreviousPage(query));
  expect(ctx.events.at(-1)).toBe("end messages:listNewer n2/3");
  expect(ctx.queryClient.getData(ctx.around, ctx.input)?.pageParams[0]).toEqual({
    cursor: "n2",
    direction: "backward",
    next: context,
    numItems: 3,
  });
  expect(Query.hasPreviousPageUnsafe(query)).toBe(false);
});

test("a two-way ensure keeps the backward pages an entry already has", async () => {
  const ctx = setupAround();
  const opts = { input: ctx.input, previousNumItems: 2, queries: ctx.queries };
  await ensureBidirectionalPaginatedQuery(ctx.queryClient, opts);
  await Effect.runPromise(Query.fetchPreviousPage(ctx.queryClient.getQuery(ctx.around, ctx.input)));
  ctx.events.length = 0;

  const handle = await ensureBidirectionalPaginatedQuery(ctx.queryClient, opts);

  expect(ctx.events).toEqual([]);
  expect(handle.data.pages.map((page) => page.page)).toEqual([
    ["n3", "n4", "n5"],
    ["n1", "n2"],
    ["a", "b", "c"],
  ]);
});

test("a two-way ensure with nothing before the start has no previous page", async () => {
  const ctx = setupAround();
  ctx.newer.length = 0;

  const handle = await ensureBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });

  expect(handle.data.pages.map((page) => page.page)).toEqual([[], ["a", "b", "c"]]);
  expect(Query.hasPreviousPageUnsafe(ctx.queryClient.getQuery(ctx.around, ctx.input))).toBe(false);
});

test("a two-way refetch retraces a short first backward page at its own size", async () => {
  const ctx = setupAround();
  await ensureBidirectionalPaginatedQuery(ctx.queryClient, {
    input: ctx.input,
    previousNumItems: 2,
    queries: ctx.queries,
  });
  await Effect.runPromise(Query.fetchPreviousPage(ctx.queryClient.getQuery(ctx.around, ctx.input)));
  ctx.watches.length = 0;

  await ctx.queryClient.invalidate(ctx.around, ctx.input);
  await ctx.queryClient.fetch(ctx.around, ctx.input);

  expect(ctx.watches).toEqual([
    "messages:listNewer n2/3",
    "messages:listNewer null/2",
    "messages:list null/3",
  ]);
  expect(ctx.queryClient.getData(ctx.around, ctx.input)?.pages.map((page) => page.page)).toEqual([
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
  await queryClient.ensure(around, input);
  const query = queryClient.getQuery(around, input);
  await Effect.runPromise(Query.fetchPreviousPage(query));
  await Effect.runPromise(Query.fetchPreviousPage(query));
  ctx.pageReads.length = 0;

  await queryClient.invalidate(around, input);
  await queryClient.fetch(around, input);

  expect(ctx.pageReads).toEqual([
    "messages:listNewer newer-1",
    "messages:listNewer null",
    "messages:list null",
  ]);
  expect(queryClient.getData(around, input)?.pages.map((page) => page.page)).toEqual([
    ["lobby:newer-2"],
    ["lobby:newer-1"],
    ["lobby:hello"],
  ]);
});
