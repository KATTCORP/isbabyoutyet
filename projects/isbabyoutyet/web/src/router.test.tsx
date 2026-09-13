import { rootRouteId } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { rootAuthToken, routerPreloadOptions } from "@/router";

test("rootAuthToken dehydrates the root cookie JWT and null for anonymous requests", () => {
  const child = { context: { token: "child-token" }, routeId: "/_auth" };
  expect(rootAuthToken([{ context: { token: "a.b.c" }, routeId: rootRouteId }, child])).toBe(
    "a.b.c",
  );
  expect(
    rootAuthToken([{ context: { token: undefined }, routeId: rootRouteId }, child]),
  ).toBeNull();
  expect(rootAuthToken([{ context: { token: 42 }, routeId: rootRouteId }])).toBeNull();
  expect(rootAuthToken([])).toBeNull();
});

test("the router preloads on viewport and lets React Query own preload freshness", () => {
  expect(routerPreloadOptions).toMatchObject({
    defaultPreload: "viewport",
    // React Query is the cache of record: preloaded loader data must be
    // immediately stale to the router so ensureQueryData decides freshness.
    // Navigations to preloaded matches still commit instantly (stale matches
    // revalidate in the background).
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
});
