import type { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  makeFunctionReference,
  type FunctionReference,
  type PaginationResult,
} from "convex/server";
import { createElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { getConvexQueryPreloader } from "./preloader";
import { convexInfiniteQueryFn } from "./convexInfiniteQuery";
import {
  preloadedConvexQueryOptions,
  useInitiateConvexQuery,
  usePreloadedConvexQuery,
} from "./usePreloadedConvexQuery";
import { testPreloadedConvexQuery } from "./test-helpers";

type Profile = { isAdmin: boolean; locale: string };
type ProfileGetRef = FunctionReference<"query", "public", Record<string, never>, Profile>;
type BabyByIdRef = FunctionReference<"query", "public", { id: string }, { name: string }>;
const profileGet = makeFunctionReference<"query", Record<string, never>, Profile>("profile:get");
const babyByPublicId = makeFunctionReference<"query", { id: string }, { name: string }>(
  "baby:getByPublicId",
);
const pushIsSubscribed = makeFunctionReference<
  "query",
  { babyId: string; endpoint: string },
  boolean
>("pushSubscriptions:isSubscribed");

type TestInfinitePage = PaginationResult<string>;

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

function createWrapper(queryClient: QueryClient) {
  return function Wrapper(props: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, props.children);
  };
}

test("getConvexQueryPreloader awaits queries and returns handles with initialData", async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => ({ isAdmin: false, locale: "sv" }),
        retry: false,
      },
    },
  });

  const preloader = getConvexQueryPreloader(queryClient);
  const handle = await preloader.ensureQueryData(profileGet, {});

  expect(handle.input).toEqual({});
  expect(handle.initialData).toEqual({ isAdmin: false, locale: "sv" });
});

test("fetchQueryData replaces cached data with a fresh snapshot", async () => {
  const queryFn = vi.fn<() => Promise<{ name: string }>>(async () => ({ name: "Fresh baby" }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false } },
  });
  const queryKey = ["convexQuery", "baby:getByPublicId", { id: "baby-smith" }];
  queryClient.setQueryData(queryKey, { name: "Cached baby" });

  const preloader = getConvexQueryPreloader(queryClient);
  const handle = await preloader.fetchQueryData(babyByPublicId, { id: "baby-smith" });

  expect(queryFn).toHaveBeenCalledOnce();
  expect(handle.input).toEqual({ id: "baby-smith" });
  expect(handle.initialData).toEqual({ name: "Fresh baby" });
});

test("getConvexQueryPreloader ensures infinite pages and stores numItems", async () => {
  const queryClient = infiniteQueryClient(async () => ({
    continueCursor: "",
    isDone: true,
    page: ["row"],
  }));

  const preloader = getConvexQueryPreloader(queryClient);
  // @ts-expect-error — string is not a FunctionReference
  const handle = await preloader.ensureInfiniteQueryData("admin:listBabies", {
    args: { hideDemo: true },
    numItems: 20,
  });

  expect(handle.input).toEqual({ hideDemo: true });
  expect(handle.numItems).toBe(20);
  expect(handle.initialData.pages[0]).toEqual({
    continueCursor: "",
    isDone: true,
    page: ["row"],
  });
});

test("initiateQueryData starts the fetch without awaiting and returns a data-less handle", async () => {
  const queryFn = vi.fn<() => Promise<Profile>>(async () => ({ isAdmin: false, locale: "sv" }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false } },
  });

  const preloader = getConvexQueryPreloader(queryClient);
  const handle = preloader.initiateQueryData(profileGet, {});

  expect(handle.input).toEqual({});
  expect("initialData" in handle).toBe(false);
  await waitFor(() => {
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});

test("initiateInfiniteQueryData starts the first page without awaiting", async () => {
  const convexClientQuery = vi.fn<() => Promise<TestInfinitePage>>(async () => ({
    continueCursor: "",
    isDone: true,
    page: ["row"],
  }));
  const queryClient = infiniteQueryClient(convexClientQuery);

  const preloader = getConvexQueryPreloader(queryClient);
  // @ts-expect-error — string is not a FunctionReference
  const handle = preloader.initiateInfiniteQueryData("admin:listBabies", {
    args: { hideDemo: true },
    numItems: 20,
  });

  expect(handle.input).toEqual({ hideDemo: true });
  expect(handle.numItems).toBe(20);
  expect("initialData" in handle).toBe(false);
  await waitFor(() => {
    expect(convexClientQuery).toHaveBeenCalledTimes(1);
  });
});

test("preloadedConvexQueryOptions carries initialData only for preloaded handles", () => {
  const preloaded = testPreloadedConvexQuery<BabyByIdRef>({
    initialData: { name: "Avery" },
    input: { id: "b1" },
  });

  const withData = preloadedConvexQueryOptions(babyByPublicId, preloaded);
  expect("initialData" in withData && withData.initialData).toEqual({ name: "Avery" });

  const withoutData = preloadedConvexQueryOptions(babyByPublicId, { input: { id: "b1" } });
  expect("initialData" in withoutData).toBe(false);
});

test("usePreloadedConvexQuery suspends on the handle's query", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handle = testPreloadedConvexQuery<ProfileGetRef>({
    initialData: { isAdmin: false, locale: "sv" },
    input: {},
  });

  const { result } = renderHook(() => usePreloadedConvexQuery(profileGet, handle), {
    wrapper: createWrapper(queryClient),
  });

  await waitFor(() => {
    expect(result.current.data).toEqual({ isAdmin: false, locale: "sv" });
  });
});

test("useInitiateConvexQuery starts the fetch and returns an initiated handle", async () => {
  const queryFn = vi.fn<() => Promise<boolean>>(async () => true);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false } },
  });

  const { result } = renderHook(
    () =>
      useInitiateConvexQuery(pushIsSubscribed, {
        babyId: "b1",
        endpoint: "https://push.example",
      }),
    { wrapper: createWrapper(queryClient) },
  );

  expect(result.current.input).toEqual({ babyId: "b1", endpoint: "https://push.example" });
  await waitFor(() => {
    expect(queryFn).toHaveBeenCalled();
  });
});
