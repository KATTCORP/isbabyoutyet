import { expect, test } from "vitest";
import { routerPreloadOptions } from "@/router";

test("the router preloads on viewport and lets raf-query own preload freshness", () => {
  expect(routerPreloadOptions).toMatchObject({
    defaultPreload: "viewport",
    // raf-query is the cache of record: preloaded loader data must be
    // immediately stale to the router so raf-query's `load` decides freshness.
    // Navigations to preloaded matches still commit instantly (stale matches
    // revalidate in the background).
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
});
