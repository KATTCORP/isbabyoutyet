import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools/production";
import { TanStackRouterDevtoolsPanelInProd } from "@tanstack/react-router-devtools";

/**
 * Isolated so production `vite build` can drop this module (and the
 * `/production` Query/Router panels) when the root env gate is false.
 * Preview builds keep it: default Query/Router exports no-op when
 * `NODE_ENV !== "development"`.
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
            name: "TanStack Query",
            render: <ReactQueryDevtoolsPanel />,
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
