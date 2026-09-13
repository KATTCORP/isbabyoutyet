import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { renderResource } from "@/test/renderResource";

/**
 * Render UI under a real TanStack memory router (and theme/tooltip providers)
 * so `Link` / `ModeToggle` / `useBlocker` work without `vi.mock`.
 *
 * Returns a promise: the router resolves its initial match asynchronously,
 * so callers must `await` this before asserting on the rendered output.
 *
 * A single root route is enough — `Link` still builds the correct `href`
 * from `to` / `params` without registering every destination path, and
 * components reading `useRouterState().location` see `opts.path`.
 *
 * The UI is threaded through context into the root route's component, so the
 * returned `rerender` swaps the UI in place (same router, same history) just
 * like React Testing Library's own `rerender`.
 *
 * The returned view carries the `router`, so tests that assert on
 * location-derived UI can navigate instead of re-rendering.
 */
export async function renderWithTestRouter(ui: ReactElement, opts = { path: "/" }) {
  const UiContext = createContext<ReactNode>(null);

  const rootRoute = createRootRoute({
    component: function TestRoot() {
      return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TooltipProvider>{useContext(UiContext)}</TooltipProvider>
        </ThemeProvider>
      );
    },
  });

  const router = createRouter({
    defaultPendingMinMs: 0,
    history: createMemoryHistory({ initialEntries: [opts.path] }),
    routeTree: rootRoute,
  });

  // Resolve the initial match before rendering so the first paint isn't the
  // (empty) pending fallback.
  await router.load();

  function Shell(props: { ui: ReactNode }) {
    return (
      <UiContext.Provider value={props.ui}>
        <RouterProvider router={router} />
      </UiContext.Provider>
    );
  }

  const view = renderResource(<Shell ui={ui} />);
  const rerenderShell = view.rerender;
  const rerenderUi = (nextUi: ReactElement) => {
    rerenderShell(<Shell ui={nextUi} />);
  };
  return Object.assign(view, { rerender: rerenderUi, router });
}
