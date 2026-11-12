import { createRouter } from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { addRouterTracing, reportRouterError } from "@workspace/sentry/browser";
import { QueryClientProvider } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";
import { subscribingReader } from "@workspace/convex-query";
import { ConvexHttpClient } from "convex/browser";
import { ConvexProvider } from "convex/react";
import { routeTree } from "./routeTree.gen";
import { RootErrorComponent } from "./routes/__root";
import type { RouterContext } from "./routes/__root";
import { getAuth, requestConvex, requestHasSessionCookie } from "./lib/request-convex";
import { visitorLocale } from "./lib/visitor-locale";
import { SessionConvexReactClient, setClientAnonymous, setClientToken } from "./lib/auth-client";
import { makeQueryClient } from "./lib/query-client";

/** Router preload policy — tested without constructing the full client graph. */
export const routerPreloadOptions = {
  defaultPreload: "viewport",
  // raf-query is the cache of record, so preloaded loader data must be
  // immediately stale to the router: loaders re-run (as cheap `load` cache
  // hits) instead of the router serving its own ≤30s-old snapshot.
  // Navigation still commits instantly — stale matches revalidate in the
  // background. https://tanstack.com/router/latest/docs/guide/data-loading
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
} as const satisfies Partial<AnyRouter["options"]>;

/** What the server render hands the browser's router. */
type DehydratedRequest = {
  /** The request's cookie JWT, `null` when signed out. */
  authToken: string | null;
  /**
   * The visitor's language, when the document was rendered in it. `null` on
   * a baby's page, which is in the baby's language (`documentLocale`) and
   * shared between visitors: the browser keeps the language it detects.
   */
  locale: SupportedLocale | null;
  /** When the server rendered the document, in ms (`useNow`). */
  renderedAt: number;
  /**
   * Whether the request carried a session cookie. Without one the visitor is
   * anonymous, and the browser starts that way without asking.
   */
  sessionCookie: boolean;
};

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL!;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }

  // expectAuth keeps SSR-authenticated query results from being dropped on
  // hydration; public pages still run once auth resolves as anonymous.
  // `SessionConvexReactClient` keeps mutations from going out anonymously
  // after the signed-in session expires.
  const convexClient = new SessionConvexReactClient(convexUrl, { expectAuth: true });
  // getRouter runs once per server request, so this HTTP client and the
  // QueryClient reading through it serve only this request. Its reads wait
  // for the request's cookie token; no route does.
  const server =
    globalThis.window === undefined
      ? requestConvex({ client: new ConvexHttpClient(convexUrl), fetchToken: getAuth })
      : null;
  const queryClient = server
    ? makeQueryClient({
        isServer: true,
        live: null,
        reader: server.reader,
      })
    : makeQueryClient({
        isServer: false,
        live: convexClient,
        reader: subscribingReader(convexClient),
      });

  const context: RouterContext = {
    convexClient,
    locale: visitorLocale(),
    queryClient,
    renderedAt: Date.now(),
  };

  const router = createRouter({
    routeTree,
    // Viewport preload runs loaders when a Link scrolls into view (not just on
    // hover/focus), so e.g. visible dashboard baby cards prefetch their baby
    // pages via their loaders' `load`.
    ...routerPreloadOptions,
    // Friendly recoverable fallback for any route error (reload / go home).
    context,
    defaultErrorComponent: RootErrorComponent,
    defaultOnCatch: reportRouterError,
    scrollRestoration: true,
    // `setClientToken` and `setClientAnonymous` are the only `setAuth` owners
    // on the browser client. SSR ships the request's cookie JWT (`null` when
    // signed out); the client hands it to Convex before React mounts
    // (`expectAuth` keeps the socket paused until then). A visitor whose
    // request had no session cookie starts anonymous at once. One with a
    // cookie but no token asks `/convex/token`.
    dehydrate: async (): Promise<DehydratedRequest> => ({
      authToken: server ? await server.token() : null,
      locale: router.state.matches.some(
        (match) => match.routeId === "/baby/$publicId" && match.loaderData?.babyDoc,
      )
        ? null
        : context.locale,
      renderedAt: context.renderedAt,
      sessionCookie: requestHasSessionCookie(),
    }),
    hydrate: (dehydrated) => {
      if (dehydrated.authToken === null && !dehydrated.sessionCookie) {
        setClientAnonymous(convexClient);
      } else {
        setClientToken(convexClient, dehydrated.authToken);
      }
      // Hydrate in the language and at the moment the server rendered,
      // whatever the browser would detect. Runs before the router matches
      // its first route.
      router.update({
        context: {
          ...context,
          locale: dehydrated.locale ?? context.locale,
          renderedAt: dehydrated.renderedAt,
        },
      });
    },
    Wrap: (props) => (
      <ConvexProvider client={convexClient}>
        <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
      </ConvexProvider>
    ),
  });

  setupRouterIntegration({ queryClient, router });
  addRouterTracing(router);

  return router;
}
