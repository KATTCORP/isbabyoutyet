import { createRouter, rootRouteId } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { connectConvexLive, ConvexReader } from "@workspace/convex-query";
import { isPlainObject, isString } from "@workspace/runtime/guards";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { routeTree } from "./routeTree.gen";
import { RootErrorComponent } from "./routes/__root";
import { getDetectedLocale } from "./lib/i18n";
import { setClientToken } from "./lib/auth-client";

/** Router preload policy — tested without constructing the full client graph. */
export const routerPreloadOptions = {
  defaultPreload: "viewport",
  // raf-query is the cache of record, so preloaded loader data must be
  // immediately stale to the router: loaders re-run (as cheap `ensure` cache
  // hits) instead of the router serving its own ≤30s-old snapshot.
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
  const convexClient = new ConvexReactClient(convexUrl, { expectAuth: true });
  // getRouter runs once per server request, so this HTTP client (authenticated
  // by the root `beforeLoad`) and the QueryClient reading through it serve
  // only this request.
  const convexHttpClient = globalThis.window === undefined ? new ConvexHttpClient(convexUrl) : null;
  const queryClient = new QueryClient({
    layer: convexHttpClient
      ? ConvexReader.layerSnapshot(convexHttpClient)
      : ConvexReader.layerWatch(convexClient),
  });
  if (!convexHttpClient) {
    connectConvexLive({ client: convexClient, queryClient });
  }

  const router = createRouter({
    routeTree,
    // Viewport preload runs loaders when a Link scrolls into view (not just on
    // hover/focus), so e.g. visible dashboard baby cards prefetch their baby
    // pages via their `queryClient.ensure` loaders.
    ...routerPreloadOptions,
    // Friendly recoverable fallback for any route error (reload / go home).
    context: {
      convexClient,
      convexHttpClient,
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
      setClientToken(convexClient, dehydrated.authToken);
    },
    Wrap: (props) => (
      <ConvexProvider client={convexClient}>
        <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
      </ConvexProvider>
    ),
  });

  setupRouterIntegration({ queryClient, router });

  return router;
}
