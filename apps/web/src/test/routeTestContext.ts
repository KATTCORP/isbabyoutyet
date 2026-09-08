import type { AnyRoute } from "@tanstack/react-router";
import type { ConvexTestHarness } from "@/test/convexTestHarness";

export type RouteTestContext = {
  convexClient: ConvexTestHarness["convexClient"];
  convexPreloader: ConvexTestHarness["convexPreloader"];
  convexQueryClient: ConvexTestHarness["convexQueryClient"];
  /** Root `beforeLoad` sets this in production; route `head()` reads it. */
  locale: "en-GB";
  queryClient: ConvexTestHarness["queryClient"];
  /** Root `beforeLoad` only resolves this during SSR; client navigations see `undefined`. */
  token: undefined;
};

export function routeContextFromHarness(harness: ConvexTestHarness): RouteTestContext {
  return {
    convexClient: harness.convexClient,
    convexPreloader: harness.convexPreloader,
    convexQueryClient: harness.convexQueryClient,
    locale: "en-GB",
    queryClient: harness.queryClient,
    token: undefined,
  };
}

/** beforeLoad may enrich context, return nothing, or throw (redirect/notFound). */
type RouteBeforeLoadResult = object | void | null;

/** Runs a route's `beforeLoad` as a client navigation against the harness. */
export async function runRouteBeforeLoad(opts: {
  harness: ConvexTestHarness;
  location: { pathname: string } | undefined;
  params: Record<string, string>;
  route: AnyRoute;
}) {
  // SAFETY: Test fixture is a subset of the production type.
  const beforeLoad = opts.route.options.beforeLoad as
    | ((routeOpts: {
        context: RouteTestContext;
        location: { pathname: string };
        params: Record<string, string>;
      }) => Promise<RouteBeforeLoadResult>)
    | undefined;
  if (!beforeLoad) {
    return undefined;
  }
  return await beforeLoad({
    context: routeContextFromHarness(opts.harness),
    location: opts.location ?? { pathname: "" },
    params: opts.params,
  });
}

export async function runRouteLoader<TLoaderData>(opts: {
  harness: ConvexTestHarness;
  location: { pathname: string } | undefined;
  params: Record<string, string>;
  route: AnyRoute;
}) {
  // SAFETY: Test fixture is a subset of the production type.
  const loader = opts.route.options.loader as
    | ((routeOpts: {
        context: RouteTestContext;
        location: { pathname: string };
        params: Record<string, string>;
      }) => Promise<TLoaderData>)
    | undefined;
  if (!loader) {
    throw new Error("Route has no loader");
  }
  return await loader({
    context: routeContextFromHarness(opts.harness),
    location: opts.location ?? { pathname: "" },
    params: opts.params,
  });
}
