import { QueryClientProvider } from "@raf-query/react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { ConvexProvider } from "convex/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { vi } from "vitest";
import { makeAsyncResource, makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { LocaleProvider } from "@/lib/i18n";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import type { ParentRouteContext } from "@/test/routeTestContext";
import { routeContextFromHarness } from "@/test/routeTestContext";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";

/**
 * `Route.update()` is typed for non-structural option tweaks only, so widen it
 * to re-parent the real route (same instance, so its hooks keep resolving)
 * onto a test root.
 */
function reparentRoute<TRoute extends AnyRoute>(
  route: TRoute,
  opts: { getParentRoute: () => AnyRoute; path: string },
): TRoute {
  // SAFETY: Test fixture is a subset of the production type.
  const update = route.update as (options: typeof opts) => TRoute;
  return update(opts);
}

type OverlayHistoryOpts = {
  /**
   * `"memory"` is the in-memory history most tests use. `"browser"` drives
   * jsdom's real `window.history`, which — unlike memory history — fires
   * `popstate` on `back()` where TanStack runs navigation blockers.
   */
  engine: "browser" | "memory";
  overlayPush: boolean;
  parentEntry: string;
};

type MountedFileRouteOpts = {
  harness: ConvexTestHarness;
  initialEntry: string;
  /**
   * Shape overlay history like production: parent baby page, then push or
   * replace onto the overlay route (controls dismiss via back vs navigate).
   */
  overlayHistory: OverlayHistoryOpts | null;
  path: string;
  route: AnyRoute;
  /** Extra providers around the route outlet. */
  wrap: ((children: ReactNode) => ReactNode) | null;
};

/**
 * Mounts a real file-route component end-to-end: beforeLoad + loader + the
 * production wrapper, backed by `convex-test` through the shared harness.
 */
export async function renderMountedFileRoute(opts: MountedFileRouteOpts) {
  return await mountFileRoute(opts, { childRoutes: [], routerContext: {} });
}

/**
 * Same as {@link renderMountedFileRoute}, with extra router context (e.g. a
 * parent guard's `signedInRouteContext`) merged onto the harness defaults.
 */
export async function renderMountedFileRouteWithRouterContext(
  opts: MountedFileRouteOpts & { routerContext: ParentRouteContext },
) {
  return await mountFileRoute(opts, { childRoutes: [], routerContext: opts.routerContext });
}

type ChildFileRoute = {
  /** Relative to the parent, e.g. `"users"`, or `"/"` for an index route. */
  path: string;
  route: AnyRoute;
};

/**
 * Same as {@link renderMountedFileRouteWithRouterContext}, with the layout's
 * real child file routes mounted under it so tests can navigate between them.
 */
export async function renderMountedFileRouteTree(
  opts: MountedFileRouteOpts & {
    childRoutes: Array<ChildFileRoute>;
    routerContext: ParentRouteContext;
  },
) {
  return await mountFileRoute(opts, opts);
}

async function mountFileRoute(
  opts: MountedFileRouteOpts,
  extra: { childRoutes: Array<ChildFileRoute>; routerContext: ParentRouteContext },
) {
  const context = { ...routeContextFromHarness(opts.harness), ...extra.routerContext };

  const history =
    opts.overlayHistory === null
      ? createMemoryHistory({ initialEntries: [opts.initialEntry] })
      : await createOverlayHistory(opts.overlayHistory, opts.initialEntry);

  const rootRoute = createRootRoute({
    component: function TestRoot() {
      const outlet = (
        <QueryClientProvider client={opts.harness.queryClient}>
          <ConvexProvider
            // @ts-expect-error — integration client is not ConvexReactClient
            client={opts.harness.convexClient}
          >
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
              <TooltipProvider>
                <LocaleProvider locale="en-GB">
                  <Outlet />
                </LocaleProvider>
              </TooltipProvider>
            </ThemeProvider>
          </ConvexProvider>
        </QueryClientProvider>
      );
      return opts.wrap ? <>{opts.wrap(outlet)}</> : outlet;
    },
  });

  const mountedRoute = reparentRoute(opts.route, {
    getParentRoute: () => rootRoute,
    path: opts.path,
  });
  if (extra.childRoutes.length > 0) {
    mountedRoute.addChildren(
      extra.childRoutes.map((child) =>
        reparentRoute(child.route, { getParentRoute: () => mountedRoute, path: child.path }),
      ),
    );
  }

  const router = createRouter({
    context,
    // Closing an overlay navigates to its parent, which this single-route tree
    // does not mount.
    defaultNotFoundComponent: () => null,
    defaultPendingMinMs: 0,
    history,
    routeTree: rootRoute.addChildren([mountedRoute]),
  });

  await router.load();

  const jsdomWindow = stubJsdomWindow();
  const navigate = vi.spyOn(router, "navigate");
  const back = vi.spyOn(history, "back");
  const view = render(<RouterProvider router={router} />);
  return makeAsyncResource({ back, harness: opts.harness, navigate, router, view }, async () => {
    navigate.mockRestore();
    back.mockRestore();
    view.unmount();
    jsdomWindow.restore();
    if (opts.overlayHistory?.engine === "browser") {
      history.destroy?.();
      window.history.replaceState(null, "", "/");
    }
  });
}

async function createOverlayHistory(overlay: OverlayHistoryOpts, initialEntry: string) {
  switch (overlay.engine) {
    case "memory": {
      const history = createMemoryHistory({ initialEntries: [overlay.parentEntry] });
      if (overlay.overlayPush) {
        history.push(initialEntry, { overlay: true });
      } else {
        history.replace(initialEntry);
      }
      return history;
    }
    case "browser": {
      window.history.replaceState(null, "", overlay.parentEntry);
      const history = createBrowserHistory({ window });
      if (overlay.overlayPush) {
        history.push(initialEntry, { overlay: true });
      } else {
        history.replace(initialEntry);
      }
      // Browser history commits to `window.history` in a microtask.
      history.flush?.();
      await Promise.resolve();
      return history;
    }
    default: {
      const _exhaustive: never = overlay.engine;
      return _exhaustive;
    }
  }
}

/** Stub `Image` so browser OG/lightbox prefetch resolves immediately. */
export function stubBrowserImageResource() {
  const OriginalImage = globalThis.Image;
  class MockImage {
    #load: (() => void) | null = null;
    addEventListener(type: string, listener: () => void) {
      if (type === "load") {
        this.#load = listener;
      }
    }
    set src(value: string) {
      void value;
      queueMicrotask(() => {
        this.#load?.();
      });
    }
  }
  vi.stubGlobal("Image", MockImage);
  return makeResource({}, () => {
    vi.stubGlobal("Image", OriginalImage);
  });
}
