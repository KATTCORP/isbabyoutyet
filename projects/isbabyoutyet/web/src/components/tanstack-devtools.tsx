import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryDevtoolsPanel } from "@raf-query/react/devtools/production";
import { TanStackRouterDevtoolsPanelInProd } from "@tanstack/react-router-devtools";

/**
 * Isolated so production `vite build` can drop this module (and the
 * `/production` raf-query/Router panels) when the root env gate is false.
 * Preview builds keep it: the default exports no-op in production builds.
 */
export function TanStackAppDevtools() {
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
