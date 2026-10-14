import type { InfiniteData } from "@raf-query/react";
import { QueryClient } from "@raf-query/react";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect, expectTypeOf, onTestFinished, test } from "vitest";
import type { EnsuredConvexPaginatedQuery, EnsuredConvexQuery } from "./queries.ts";
import { convexPaginatedQuery, convexQuery } from "./queries.ts";
import { ConvexReader } from "./reader.ts";
import { makeTestConvexClient } from "./testing.ts";

const getMessage = makeFunctionReference<"query", { id: string }, string | null>("messages:get");
const listMessages = makeFunctionReference<
  "query",
  { paginationOpts: PaginationOptions; room: string },
  PaginationResult<string>
>("messages:list");

function setup() {
  const reads: Array<string> = [];
  const backend = makeTestConvexClient(async (query, args) => {
    reads.push(getFunctionName(query));
    if (getFunctionName(query) === "messages:list") {
      return { continueCursor: "", isDone: true, page: [`${args.room}:hello`] };
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
  expect(handle).toMatchObject({ ensured: true, input: { id: "a" } });
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
});
