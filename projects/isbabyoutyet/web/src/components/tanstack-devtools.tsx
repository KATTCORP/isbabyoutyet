import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryDevtoolsPanel } from "@raf-query/react";
import { TanStackRouterDevtoolsPanelInProd } from "@tanstack/react-router-devtools";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Isolated so production `vite build` can drop this module (and the
 * raf-query/Router panels) when the root env gate is false. Preview builds
 * keep it: both panels render in production builds.
 *
 * The server renders a stub that returns null (see `vite.config.ts`), so
 * the client waits until hydration has finished before mounting: rendering
 * the panel during hydration mismatches the server HTML and makes React
 * re-render the whole page, which shows as a jump on every preview load.
 */
export function TanStackAppDevtools() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return (
    <div data-slot="tanstack-devtools">
      <TanStackDevtools
        config={{
          position: "bottom-right",
        }}
        plugins={[
          {
            name: "raf-query",
            render: <QueryDevtoolsPanel />,
          },
          {
            name: "TanStack Router",
            render: <TanStackRouterDevtoolsPanelInProd />,
          },
        ]}
      />
    </div>
  );
}
