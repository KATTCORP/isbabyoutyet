import type { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import type { PaginationResult } from "convex/server";
import { expect, test, vi } from "vitest";
import {
  CONVEX_INFINITE_QUERY_KEY,
  convexInfiniteQuery,
  convexInfiniteQueryFn,
} from "./convexInfiniteQuery";

type TestInfinitePage = PaginationResult<object | string>;

type StubConvexQueryClientFields = {
  convexClient: { query: () => Promise<TestInfinitePage> };
  serverHttpClient: { consistentQuery: () => Promise<TestInfinitePage> } | undefined;
};

/** Stand-in implementing only the members `convexInfiniteQueryFn` reads. */
function stubConvexQueryClient(fields: StubConvexQueryClientFields) {
  const stub = {
    ...fields,
    queryFn: () => async () => {
      throw new Error("fallback should not run");
    },
  };
  // @ts-expect-error — stand-in only implements the members convexInfiniteQueryFn reads
  const convexQueryClient: ConvexQueryClient = stub;
  return convexQueryClient;
}

/** A QueryClient wired the way the router does it: one default queryFn per client. */
function queryClientFor(fields: StubConvexQueryClientFields) {
  return new QueryClient({
    defaultOptions: {
      queries: { queryFn: convexInfiniteQueryFn(stubConvexQueryClient(fields)), retry: false },
    },
  });
}

/** Runs `fn` with `globalThis.window` removed so fetches take the SSR branch. */
async function withoutWindow<T>(fn: () => Promise<T>) {
  const originalWindow = globalThis.window;
  // @ts-expect-error — intentional delete for SSR branch
  delete globalThis.window;
  try {
    return await fn();
  } finally {
    globalThis.window = originalWindow;
  }
}

/**
 * TanStack still requires deprecated `direction` on infinite `queryFn` context.
 * Keep the field here so call sites stay lint-clean.
 */
function queryFnContext<TContext>(context: TContext) {
  return {
    ...context,
    // oxlint-disable-next-line typescript/no-deprecated -- QueryFunctionContext still requires this field
    direction: "forward" as const,
  };
}

test("convexInfiniteQuery builds cursor pagination options", () => {
  // @ts-expect-error — string is not a FunctionReference
  const options = convexInfiniteQuery("timeline:listByBaby", {
    args: { babyId: "baby-1" },
    initialNumItems: 20,
  });

  expect(options.queryKey[0]).toBe(CONVEX_INFINITE_QUERY_KEY);
  expect(options.initialPageParam).toEqual({ cursor: null, numItems: 20 });
  expect(
    options.getNextPageParam(
      { continueCursor: "c1", isDone: false, page: [] },
      [],
      { cursor: null, numItems: 20 },
      [],
    ),
  ).toEqual({ cursor: "c1", numItems: 20 });
  expect(
    options.getNextPageParam(
      { continueCursor: "c1", isDone: true, page: [] },
      [],
      { cursor: null, numItems: 20 },
      [],
    ),
  ).toBeUndefined();
});

test("convexInfiniteQuery leaves fetching to the QueryClient's default queryFn", async () => {
  const query = vi.fn<() => Promise<TestInfinitePage>>(async () => ({
    continueCursor: "",
    isDone: true,
    page: ["row"],
  }));
  const queryClient = queryClientFor({ convexClient: { query }, serverHttpClient: undefined });

  // @ts-expect-error — string is not a FunctionReference
  const options = convexInfiniteQuery("admin:listBabies", {
    args: { hideDemo: true },
    initialNumItems: 20,
  });
  expect("queryFn" in options).toBe(false);

  const data = await queryClient.ensureInfiniteQueryData(options);

  expect(query).toHaveBeenCalledWith("admin:listBabies", {
    hideDemo: true,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(data.pages).toEqual([{ continueCursor: "", isDone: true, page: ["row"] }]);
});

test("concurrent SSR QueryClients each fetch pages through their own Convex client", async () => {
  // Models two overlapping server requests: each `getRouter()` builds its own
  // ConvexQueryClient (with that visitor's auth on `serverHttpClient`) and
  // QueryClient. A module-level "registered client" would let the request that
  // registered last serve the other request's pages.
  function ssrClient(label: string) {
    const consistentQuery = vi.fn<() => Promise<TestInfinitePage>>(async () => ({
      continueCursor: "",
      isDone: true,
      page: [label],
    }));
    const queryClient = queryClientFor({
      convexClient: { query: vi.fn<() => Promise<TestInfinitePage>>() },
      serverHttpClient: { consistentQuery },
    });
    return { consistentQuery, queryClient };
  }
  // @ts-expect-error — string is not a FunctionReference
  const options = convexInfiniteQuery("timeline:listByBaby", {
    args: { babyId: "baby-1" },
    initialNumItems: 20,
  });

  const [alice, bob] = await withoutWindow(async () => {
    const requestA = ssrClient("alice");
    const pendingA = requestA.queryClient.ensureInfiniteQueryData(options);
    // Request B starts (and would have re-registered a global) while A is in flight.
    const requestB = ssrClient("bob");
    const pendingB = requestB.queryClient.ensureInfiniteQueryData(options);
    const [dataA, dataB] = await Promise.all([pendingA, pendingB]);
    return [
      { ...requestA, data: dataA },
      { ...requestB, data: dataB },
    ];
  });

  expect(alice.data.pages[0]?.page).toEqual(["alice"]);
  expect(bob.data.pages[0]?.page).toEqual(["bob"]);
  expect(alice.consistentQuery).toHaveBeenCalledTimes(1);
  expect(bob.consistentQuery).toHaveBeenCalledTimes(1);
});

test("convexInfiniteQueryFn merges pageParam into paginationOpts", async () => {
  const query = vi.fn<
    () => Promise<{ continueCursor: string; isDone: boolean; page: Array<unknown> }>
  >(async () => ({ continueCursor: "", isDone: true, page: [] }));
  const convexQueryClient = {
    convexClient: { query },
    queryFn: () => async () => {
      throw new Error("fallback should not run");
    },
    serverHttpClient: undefined,
  };

  // @ts-expect-error — stand-in only implements queryFn/convexClient
  const queryFn = convexInfiniteQueryFn(convexQueryClient);
  const result = await queryFn(
    queryFnContext({
      client: new QueryClient(),
      meta: undefined,
      pageParam: { cursor: null, numItems: 20 },
      queryKey: [CONVEX_INFINITE_QUERY_KEY, "admin:listBabies", { hideDemo: true }],
      signal: new AbortController().signal,
    }),
  );

  expect(query).toHaveBeenCalledWith("admin:listBabies", {
    hideDemo: true,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(result).toEqual({ continueCursor: "", isDone: true, page: [] });
});

test("convexInfiniteQueryFn falls back for non-infinite keys", async () => {
  const fallback = vi.fn<() => Promise<string>>(async () => "ok");
  const convexQueryClient = {
    convexClient: { query: vi.fn<() => Promise<TestInfinitePage>>() },
    queryFn: () => fallback,
    serverHttpClient: undefined,
  };

  // @ts-expect-error — stand-in only implements queryFn/convexClient
  const queryFn = convexInfiniteQueryFn(convexQueryClient);
  const result = await queryFn(
    queryFnContext({
      client: new QueryClient(),
      meta: undefined,
      pageParam: undefined,
      queryKey: ["convexQuery", "profile:get", {}],
      signal: new AbortController().signal,
    }),
  );

  expect(fallback).toHaveBeenCalled();
  expect(result).toBe("ok");
});

test("convexInfiniteQueryFn rejects without a pageParam", async () => {
  const convexQueryClient = {
    convexClient: { query: vi.fn<() => Promise<TestInfinitePage>>() },
    queryFn: () => async () => "unused",
    serverHttpClient: undefined,
  };
  // @ts-expect-error — stand-in only implements queryFn/convexClient
  const queryFn = convexInfiniteQueryFn(convexQueryClient);

  await expect(
    queryFn(
      queryFnContext({
        client: new QueryClient(),
        meta: undefined,
        pageParam: undefined,
        queryKey: [CONVEX_INFINITE_QUERY_KEY, "admin:listBabies", { hideDemo: true }],
        signal: new AbortController().signal,
      }),
    ),
  ).rejects.toThrow("Convex infinite query requires an initialPageParam");
});

test("convexInfiniteQueryFn uses the SSR HTTP client when window is undefined", async () => {
  const consistentQuery = vi.fn<
    () => Promise<{ continueCursor: string; isDone: boolean; page: Array<unknown> }>
  >(async () => ({ continueCursor: "", isDone: true, page: ["ssr"] }));
  const convexQueryClient = {
    convexClient: { query: vi.fn<() => Promise<TestInfinitePage>>() },
    queryFn: () => async () => {
      throw new Error("fallback should not run");
    },
    serverHttpClient: { consistentQuery },
  };

  // @ts-expect-error — stand-in only implements queryFn/convexClient
  const queryFn = convexInfiniteQueryFn(convexQueryClient);
  const result = await withoutWindow(() =>
    queryFn(
      queryFnContext({
        client: new QueryClient(),
        meta: undefined,
        pageParam: { cursor: null, numItems: 20 },
        queryKey: [CONVEX_INFINITE_QUERY_KEY, "admin:listBabies", { hideDemo: true }],
        signal: new AbortController().signal,
      }),
    ),
  );

  expect(consistentQuery).toHaveBeenCalledWith("admin:listBabies", {
    hideDemo: true,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(result).toEqual({ continueCursor: "", isDone: true, page: ["ssr"] });
});

test("convexInfiniteQueryFn rejects on SSR when the HTTP client is missing", async () => {
  const convexQueryClient = {
    convexClient: { query: vi.fn<() => Promise<TestInfinitePage>>() },
    queryFn: () => async () => "unused",
    serverHttpClient: undefined,
  };

  // @ts-expect-error — stand-in only implements queryFn/convexClient
  const queryFn = convexInfiniteQueryFn(convexQueryClient);
  await expect(
    withoutWindow(() =>
      queryFn(
        queryFnContext({
          client: new QueryClient(),
          meta: undefined,
          pageParam: { cursor: null, numItems: 20 },
          queryKey: [CONVEX_INFINITE_QUERY_KEY, "admin:listBabies", { hideDemo: true }],
          signal: new AbortController().signal,
        }),
      ),
    ),
  ).rejects.toThrow("Convex SSR HTTP client is not available");
});
