import type { AnyRoute } from "@tanstack/react-router";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import type { ConvexTestHarness } from "@/test/convexTestHarness";

export type RouteTestContext = {
  convexClient: ConvexTestHarness["convexClient"];
  /** The visitor's language (`visitorLocale` in production). */
  locale: SupportedLocale;
  queryClient: ConvexTestHarness["queryClient"];
};

export function routeContextFromHarness(harness: ConvexTestHarness): RouteTestContext {
  return {
    convexClient: harness.convexClient,
    locale: "en-GB",
    queryClient: harness.queryClient,
  };
}

type RouteLoaderOpts = {
  harness: ConvexTestHarness;
  location: { pathname: string } | undefined;
  params: Record<string, string>;
  route: AnyRoute;
};

export async function runRouteLoader<TLoaderData>(opts: RouteLoaderOpts) {
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
