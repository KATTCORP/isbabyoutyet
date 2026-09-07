import { createRouter, rootRouteId } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { isPlainObject, isString } from "@workspace/runtime/guards";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";
import {
  convexInfiniteQueryFn,
  getConvexQueryPreloader,
  registerConvexInfiniteQueryClient,
} from "@workspace/convex-prefetch";
import { RootErrorComponent } from "./routes/__root";
import { getDetectedLocale } from "./lib/i18n";
import { setClientToken } from "./lib/auth-client";

/** Router preload policy — tested without constructing the full client graph. */
export const routerPreloadOptions = {
  defaultPreload: "viewport",
  // React Query is the cache of record, so preloaded loader data must be
  // immediately stale to the router: loaders re-run (as cheap ensureQueryData
  // cache hits) instead of the router serving its own ≤30s-old snapshot.
  // Navigation still commits instantly — stale matches revalidate in the
  // background. https://tanstack.com/router/latest/docs/guide/data-loading
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
} as const;

/**
 * Cookie JWT the root `beforeLoad` resolved on the server, for the client
 * `hydrate` hand-off. `null` (not `undefined`) so the dehydrated payload is
 * explicit about "no signed-in cookie".
 *
 * @internal exported for tests
 */
export function rootAuthToken(matches: ReadonlyArray<{ context: unknown; routeId: string }>) {
  const rootMatch = matches.find((match) => match.routeId === rootRouteId);
  const context = rootMatch?.context;
  if (!isPlainObject(context) || !isString(context.token)) {
    return null;
  }
  return context.token;
}

type DehydratedAuth = { authToken: string | null };

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL!;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }

  // expectAuth keeps SSR-authenticated query results from being dropped on
  // hydration; public pages still run once auth resolves as anonymous.
  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    expectAuth: true,
  });
  registerConvexInfiniteQueryClient(convexQueryClient);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        // Handles both regular Convex queries and infinite/paginated keys.
        queryFn: convexInfiniteQueryFn(convexQueryClient),
      },
    },
  });
  convexQueryClient.connect(queryClient);
  const convexPreloader = getConvexQueryPreloader(queryClient);

  const router = createRouter({
    routeTree,
    // Viewport preload runs loaders when a Link scrolls into view (not just on
    // hover/focus), so e.g. visible dashboard baby cards prefetch their baby
    // pages via the ensureQueryData prefetchers.
    ...routerPreloadOptions,
    // Friendly recoverable fallback for any route error (reload / go home).
    context: {
      convexClient: convexQueryClient.convexClient,
      convexPreloader,
      convexQueryClient,
      locale: getDetectedLocale(),
      queryClient,
      token: undefined,
    },
    defaultErrorComponent: RootErrorComponent,
    scrollRestoration: true,
    // `setClientToken` is the only `setAuth` owner on the browser client.
    // SSR ships the cookie JWT the root `beforeLoad` resolved; the client hands
    // it to Convex before React mounts (`expectAuth` keeps the socket paused
    // until then). Anonymous visitors resolve via one `/convex/token` 401.
    dehydrate: (): DehydratedAuth => ({ authToken: rootAuthToken(router.state.matches) }),
    hydrate: (dehydrated) => {
      setClientToken(convexQueryClient.convexClient, dehydrated.authToken);
    },
    Wrap: (props) => (
      <ConvexProvider client={convexQueryClient.convexClient}>{props.children}</ConvexProvider>
    ),
  });

  setupRouterSsrQueryIntegration({ queryClient, router });

  return router;
}
