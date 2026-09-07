import type { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import {
  makeFunctionReference,
  type DefaultFunctionArgs,
  type FunctionReference,
  type PaginationResult,
} from "convex/server";
import { createElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";

import { convexInfiniteQueryFn } from "./convexInfiniteQuery";
import { testPreloadedConvexInfiniteQuery } from "./test-helpers";
import { usePreloadedConvexInfiniteQuery } from "./usePreloadedConvexInfiniteQuery";

type WatchHandle = {
  localQueryResult: () => undefined;
  onUpdate: (cb: () => void) => () => void;
};

type WatchQuery = (funcRef: FunctionReference<"query">, args: DefaultFunctionArgs) => WatchHandle;

type TestInfinitePage = PaginationResult<{ id: string }>;

/** QueryClient whose default queryFn pages through the given Convex `query` stub. */
function infiniteQueryClient(query: () => Promise<TestInfinitePage>) {
  const stub = {
    convexClient: { query },
    queryFn: () => async () => {
      throw new Error("fallback should not run");
    },
    serverHttpClient: undefined,
  };
  // @ts-expect-error — stand-in only implements the members convexInfiniteQueryFn reads
  const convexQueryClient: ConvexQueryClient = stub;
  return new QueryClient({
    defaultOptions: {
      queries: { queryFn: convexInfiniteQueryFn(convexQueryClient), retry: false },
    },
  });
}

function idleWatchQuery() {
  return vi.fn<WatchQuery>(() => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => undefined,
  }));
}

/**
 * `useConvex()` only reads context, so the real `ConvexProvider` happily
 * carries a `watchQuery`-shaped stand-in for the live-page subscriptions.
 */
function createWrapper(queryClient: QueryClient, watchQuery: WatchQuery) {
  // @ts-expect-error — stand-in only implements watchQuery
  const convex: ConvexReactClient = { watchQuery };
  return function Wrapper(props: { children: ReactNode }) {
    return createElement(
      ConvexProvider,
      { client: convex },
      createElement(QueryClientProvider, { client: queryClient }, props.children),
    );
  };
}

test("usePreloadedConvexInfiniteQuery reads preloaded pages and watches them", async () => {
  const queryClient = infiniteQueryClient(vi.fn<() => Promise<TestInfinitePage>>());

  const handle = testPreloadedConvexInfiniteQuery({
    initialData: {
      pageParams: [{ cursor: null, numItems: 20 }],
      pages: [{ continueCursor: "", isDone: true, page: [{ id: "1", tag: "news" }] }],
    },
    input: { tag: "news" },
    numItems: 20,
  });

  const watchQuery = idleWatchQuery();
  const { result } = renderHook(
    () =>
      // @ts-expect-error — string is not a FunctionReference
      usePreloadedConvexInfiniteQuery("posts:list", {
        handle,
        remixArgs: null,
      }),
    { wrapper: createWrapper(queryClient, watchQuery) },
  );

  await waitFor(() => {
    expect(result.current.data.pages[0]).toEqual({
      continueCursor: "",
      isDone: true,
      page: [{ id: "1", tag: "news" }],
    });
  });
  expect(result.current.hasNextPage).toBe(false);
  // Built-in live sync: each loaded page gets a Convex watch
  expect(watchQuery).toHaveBeenCalledWith(makeFunctionReference("posts:list"), {
    paginationOpts: { cursor: null, numItems: 20 },
    tag: "news",
  });
});

test("usePreloadedConvexInfiniteQuery fetches when the handle has no initialData", async () => {
  const query = vi.fn<() => Promise<TestInfinitePage>>(async () => ({
    continueCursor: "",
    isDone: true,
    page: [{ id: "fetched" }],
  }));
  const queryClient = infiniteQueryClient(query);

  const initiatedHandle = { input: { tag: "news" }, numItems: 20 };
  const { result } = renderHook(
    () =>
      // @ts-expect-error — string is not a FunctionReference
      usePreloadedConvexInfiniteQuery("posts:listFresh", {
        handle: initiatedHandle,
        remixArgs: null,
      }),
    { wrapper: createWrapper(queryClient, idleWatchQuery()) },
  );

  await waitFor(() => {
    expect(result.current.data.pages[0]).toEqual({
      continueCursor: "",
      isDone: true,
      page: [{ id: "fetched" }],
    });
  });
  expect(query).toHaveBeenCalledWith("posts:listFresh", {
    paginationOpts: { cursor: null, numItems: 20 },
    tag: "news",
  });
});

test("usePreloadedConvexInfiniteQuery remixes args from local state", async () => {
  const queryClient = infiniteQueryClient(vi.fn<() => Promise<TestInfinitePage>>());

  const handle = testPreloadedConvexInfiniteQuery({
    initialData: {
      pageParams: [{ cursor: null, numItems: 20 }],
      pages: [{ continueCursor: "", isDone: true, page: [{ id: "1", tag: "news" }] }],
    },
    input: { tag: "news" },
    numItems: 20,
  });

  const watchQuery = idleWatchQuery();
  const { result } = renderHook(
    () =>
      // @ts-expect-error — string is not a FunctionReference
      usePreloadedConvexInfiniteQuery("posts:list", {
        handle,
        remixArgs: (args) => ({ ...args, visitor: "v1" }),
      }),
    { wrapper: createWrapper(queryClient, watchQuery) },
  );

  await waitFor(() => {
    expect(result.current.data.pages).toHaveLength(1);
  });
  // Live watch uses the remixed args
  expect(watchQuery).toHaveBeenCalledWith(makeFunctionReference("posts:list"), {
    paginationOpts: { cursor: null, numItems: 20 },
    tag: "news",
    visitor: "v1",
  });
});
