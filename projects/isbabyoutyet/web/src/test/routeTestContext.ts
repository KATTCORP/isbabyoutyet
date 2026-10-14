import type { AnyRoute } from "@tanstack/react-router";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { loadSignedInProfile } from "@/lib/signed-in-profile";
import type { ConvexTestHarness } from "@/test/convexTestHarness";

export type RouteTestContext = {
  convexClient: ConvexTestHarness["convexClient"];
  convexHttpClient: null;
  /** Set by the root `beforeLoad` in production; tests mount routes without it. */
  locale: SupportedLocale;
  queryClient: ConvexTestHarness["queryClient"];
};

export function routeContextFromHarness(harness: ConvexTestHarness): RouteTestContext {
  return {
    convexClient: harness.convexClient,
    convexHttpClient: null,
    locale: "en-GB",
    queryClient: harness.queryClient,
  };
}

/** beforeLoad may enrich context, return nothing, or throw (redirect/notFound). */
type RouteBeforeLoadResult = object | void | null;

export async function runRouteBeforeLoad(opts: {
  harness: ConvexTestHarness;
  params: Record<string, string>;
  route: AnyRoute;
}) {
  // SAFETY: Test fixture is a subset of the production type.
  const beforeLoad = opts.route.options.beforeLoad as
    | ((routeOpts: {
        context: RouteTestContext;
        params: Record<string, string>;
      }) => Promise<RouteBeforeLoadResult>)
    | undefined;
  if (!beforeLoad) {
    return undefined;
  }
  return await beforeLoad({
    context: routeContextFromHarness(opts.harness),
    params: opts.params,
  });
}

/**
 * What the `_auth` guards add to route context for the harness identity,
 * from the real {@link loadSignedInProfile}.
 */
export async function signedInRouteContext(harness: ConvexTestHarness) {
  const session = await loadSignedInProfile({
    context: { convexHttpClient: null, queryClient: harness.queryClient, token: undefined },
    fetchToken: () => Promise.resolve(null),
  });
  if (!session) {
    throw new Error("The harness identity isn't signed in");
  }
  return session;
}

export type SignedInRouteContext = Awaited<ReturnType<typeof signedInRouteContext>>;

/** Context parent guards add (all of it for `/_auth`, `me` for baby overlays). */
export type ParentRouteContext = Partial<SignedInRouteContext>;

type RouteLoaderOpts = {
  harness: ConvexTestHarness;
  location: { pathname: string } | undefined;
  params: Record<string, string>;
  route: AnyRoute;
};

export async function runRouteLoader<TLoaderData>(opts: RouteLoaderOpts) {
  return await runLoader<TLoaderData>(opts, {});
}

/**
 * Same as {@link runRouteLoader}, with extra router context (e.g. a parent
 * guard's {@link signedInRouteContext}) merged onto the harness defaults.
 */
export async function runRouteLoaderWithRouterContext<TLoaderData>(
  opts: RouteLoaderOpts & { routerContext: ParentRouteContext },
) {
  return await runLoader<TLoaderData>(opts, opts.routerContext);
}

async function runLoader<TLoaderData>(opts: RouteLoaderOpts, routerContext: ParentRouteContext) {
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
    context: { ...routeContextFromHarness(opts.harness), ...routerContext },
    location: opts.location ?? { pathname: "" },
    params: opts.params,
  });
}
