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
import { convexBidirectionalPaginatedQuery, convexPaginatedQuery, convexQuery } from "./queries.ts";
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
  const queryClient = new QueryClient({
    isServer: false,
    layer: ConvexReader.layerWatch(backend.client),
  });
  onTestFinished(() => queryClient.dispose());
  return { queryClient, reads };
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
  expect(data?.pageParams).toEqual([
    { cursor: "newer-1", direction: "backward", numItems: 10 },
    { cursor: null, direction: "backward", numItems: 10 },
    { cursor: null, direction: "forward", numItems: 10 },
  ]);
  expect(Query.hasPreviousPageUnsafe(query)).toBe(false);
});
