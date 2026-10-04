import {
  infiniteQueryOptions,
  QueryClient,
  QueryClientProvider,
  queryOptions,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import {
  getQueryInitiator,
  getQueryPreloader,
  preloadedInfiniteQueryOptions,
  preloadedQueryOptions,
  useInitiateInfiniteQuery,
  useInitiateQuery,
} from "./index.js";
import {
  testInitiatedInfiniteQuery,
  testInitiatedQuery,
  testPreloadedInfiniteQuery,
  testPreloadedQuery,
} from "./test-helpers.js";

const postById = (input: { postId: string }) =>
  queryOptions({
    queryFn: async () => ({ id: input.postId, title: `Post ${input.postId}` }),
    queryKey: ["posts", "byId", input] as const,
  });

const postsInfinite = (input: { tag: string }) =>
  infiniteQueryOptions({
    getNextPageParam: () => null,
    queryFn: async () => ({
      page: [{ id: "1", tag: input.tag }],
      // SAFETY: Test fixture is a subset of the production type.
      nextCursor: null as string | null,
    }),
    queryKey: ["posts", "infinite", input] as const,
    // SAFETY: Test fixture is a subset of the production type.
    initialPageParam: null as string | null,
  });

const accountSettings = () =>
  queryOptions({
    queryFn: async () => ({ theme: "dark" as const }),
    queryKey: ["account", "settings"] as const,
  });

const failingFactory = (input: { postId: string }) =>
  queryOptions({
    queryFn: async () => {
      throw new Error("boom");
    },
    queryKey: ["posts", "fail", input] as const,
  });

const failingInfinite = (input: { tag: string }) =>
  infiniteQueryOptions({
    getNextPageParam: () => null,
    queryFn: async () => {
      throw new Error("infinite boom");
    },
    queryKey: ["posts", "infinite-fail", input] as const,
    // SAFETY: Test fixture is a subset of the production type.
    initialPageParam: null as string | null,
  });

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, props.children);
  };
}

test("getQueryInitiator starts ensureQueryData without awaiting and returns a handle", async () => {
  const queryClient = new QueryClient();
  const onError = vi.fn<(options: { error: unknown }) => void>();
  const initiator = getQueryInitiator(queryClient, { onError });

  const handle = initiator.ensureQueryData(postById, { postId: "1" });
  expect(handle.input).toEqual({ postId: "1" });

  const options = preloadedQueryOptions(postById, handle);
  const data = await queryClient.query({ ...options, staleTime: "static" });
  expect(data).toEqual({ id: "1", title: "Post 1" });
  expect(onError).not.toHaveBeenCalled();
});

test("getQueryInitiator forwards ensureQueryData errors to onError", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onError = vi.fn<(options: { error: unknown }) => void>();

  const initiator = getQueryInitiator(queryClient, { onError });
  initiator.ensureQueryData(failingFactory, { postId: "x" });

  await vi.waitFor(() => {
    expect(onError).toHaveBeenCalled();
  });
});

test("getQueryInitiator safely ignores background errors without an onError handler", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ignoredFailureFactory = () =>
    queryOptions({
      queryFn: async () => {
        throw new Error("ignored");
      },
      queryKey: ["posts", "ignored-failure"] as const,
    });

  getQueryInitiator(queryClient).ensureQueryData(ignoredFailureFactory);

  await vi.waitFor(() => {
    expect(queryClient.getQueryState(["posts", "ignored-failure"])?.status).toBe("error");
  });
});

test("getQueryInitiator starts infinite queries in the background", async () => {
  const queryClient = new QueryClient();
  const initiator = getQueryInitiator(queryClient);
  const handle = initiator.ensureInfiniteQueryData(postsInfinite, { tag: "news" });
  expect(handle.input).toEqual({ tag: "news" });

  const options = preloadedInfiniteQueryOptions(postsInfinite, handle);
  const data = await queryClient.infiniteQuery({ ...options, staleTime: "static" });
  expect(data.pages[0]?.page[0]?.tag).toBe("news");
});

test("getQueryInitiator rejects factories without infinite-query page options", () => {
  const initiator = getQueryInitiator(new QueryClient());

  expect(() => initiator.ensureInfiniteQueryData(postById, { postId: "invalid" })).toThrow(
    "Infinite query options require page parameters",
  );
});

test("getQueryPreloader awaits data and returns a preloaded handle with initialData", async () => {
  const queryClient = new QueryClient();
  const preloader = getQueryPreloader(queryClient);

  const handle = await preloader.ensureQueryData(postById, { postId: "2" });
  expect(handle.input).toEqual({ postId: "2" });
  expect(handle.initialData).toEqual({ id: "2", title: "Post 2" });

  const options = preloadedQueryOptions(postById, handle);
  expect(options.initialData).toEqual(handle.initialData);
});

test("getQueryPreloader awaits infinite query data", async () => {
  const queryClient = new QueryClient();
  const preloader = getQueryPreloader(queryClient);
  const handle = await preloader.ensureInfiniteQueryData(postsInfinite, { tag: "hot" });
  expect(handle.initialData.pages[0]?.page[0]?.tag).toBe("hot");

  const options = preloadedInfiniteQueryOptions(postsInfinite, handle);
  expect(options.initialData).toEqual(handle.initialData);
});

test("preloadedQueryOptions rebuilds a no-arg factory from an initiated handle", async () => {
  const queryClient = new QueryClient();
  const initiator = getQueryInitiator(queryClient);
  const handle = initiator.ensureQueryData(accountSettings);
  const options = preloadedQueryOptions(accountSettings, handle);
  const data = await queryClient.query({ ...options, staleTime: "static" });
  expect(data).toEqual({ theme: "dark" });
});

test("preloadedQueryOptions supports remixInput on initiated handles", async () => {
  const queryClient = new QueryClient();
  const handle = testInitiatedQuery(postById, { postId: "a" });
  const options = preloadedQueryOptions(postById, handle, (input) => ({
    postId: `${input.postId}-remixed`,
  }));
  const data = await queryClient.query({ ...options, staleTime: "static" });
  expect(data).toEqual({ id: "a-remixed", title: "Post a-remixed" });
});

test("preloadedQueryOptions preserves initialData when remixing a preloaded handle", async () => {
  const queryClient = new QueryClient();
  const preloader = getQueryPreloader(queryClient);
  const handle = await preloader.ensureQueryData(postById, { postId: "remix" });
  const options = preloadedQueryOptions(postById, handle, (input) => input);
  expect(options.initialData).toEqual(handle.initialData);
});

test("preloadedInfiniteQueryOptions supports remixInput on initiated handles", async () => {
  const queryClient = new QueryClient();
  const handle = testInitiatedInfiniteQuery(postsInfinite, { tag: "a" });
  const options = preloadedInfiniteQueryOptions(postsInfinite, handle, (input) => ({
    tag: `${input.tag}-remixed`,
  }));
  const data = await queryClient.infiniteQuery({ ...options, staleTime: "static" });
  expect(data.pages[0]?.page[0]?.tag).toBe("a-remixed");
});

test("preloadedInfiniteQueryOptions preserves initialData for preloaded handles", async () => {
  const queryClient = new QueryClient();
  const preloader = getQueryPreloader(queryClient);
  const handle = await preloader.ensureInfiniteQueryData(postsInfinite, { tag: "saved" });
  const options = preloadedInfiniteQueryOptions(postsInfinite, handle);
  expect(options.initialData).toEqual(handle.initialData);
});

test("getQueryInitiator forwards infinite query errors to onError", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onError = vi.fn<(options: { error: unknown }) => void>();

  const initiator = getQueryInitiator(queryClient, { onError });
  initiator.ensureInfiniteQueryData(failingInfinite, { tag: "x" });

  await vi.waitFor(() => {
    expect(onError).toHaveBeenCalled();
  });
});

test("preloadedInfiniteQueryOptions remixes preloaded infinite handles", async () => {
  const queryClient = new QueryClient();
  const preloader = getQueryPreloader(queryClient);
  const handle = await preloader.ensureInfiniteQueryData(postsInfinite, { tag: "saved" });
  const options = preloadedInfiniteQueryOptions(postsInfinite, handle, (input) => input);
  expect(options.initialData).toEqual(handle.initialData);
});

test("useInitiateQuery returns a handle and warms the cache", async () => {
  const queryClient = new QueryClient();
  const wrapper = createWrapper(queryClient);

  const { result } = renderHook(() => useInitiateQuery(postById, { postId: "hook-1" }), {
    wrapper,
  });

  expect(result.current.input).toEqual({ postId: "hook-1" });

  await waitFor(async () => {
    const data = queryClient.getQueryData(["posts", "byId", { postId: "hook-1" }]);
    expect(data).toEqual({ id: "hook-1", title: "Post hook-1" });
  });
});

test("useInitiateInfiniteQuery returns a handle and warms the cache", async () => {
  const queryClient = new QueryClient();
  const wrapper = createWrapper(queryClient);

  const { result } = renderHook(() => useInitiateInfiniteQuery(postsInfinite, { tag: "hook" }), {
    wrapper,
  });

  expect(result.current.input).toEqual({ tag: "hook" });

  await waitFor(async () => {
    const data = queryClient.getQueryData(["posts", "infinite", { tag: "hook" }]);
    expect(data).toBeDefined();
  });
});

test("helpers build branded handles for unit tests", () => {
  const initiated = testInitiatedQuery(postById, { postId: "t" });
  expect(initiated.input).toEqual({ postId: "t" });

  const preloaded = testPreloadedQuery(postById, { id: "t", title: "Post t" }, { postId: "t" });
  expect(preloaded.initialData.title).toBe("Post t");

  const initiatedInfinite = testInitiatedInfiniteQuery(postsInfinite, { tag: "t" });
  expect(initiatedInfinite.input).toEqual({ tag: "t" });

  const preloadedInfinite = testPreloadedInfiniteQuery(
    postsInfinite,
    {
      pageParams: [null],
      pages: [{ nextCursor: null, page: [{ id: "1", tag: "t" }] }],
    },
    { tag: "t" },
  );
  expect(preloadedInfinite.initialData.pages[0]?.page[0]?.tag).toBe("t");
});
