import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools/production";
import { TanStackRouterDevtoolsPanelInProd } from "@tanstack/react-router-devtools";
import { useClientHydration } from "@/lib/use-client-hydration";

/**
 * Isolated so production `vite build` can drop this module (and the
 * `/production` Query/Router panels) when the root env gate is false.
 * Preview builds keep it: default Query/Router exports no-op when
 * `NODE_ENV !== "development"`.
 *
 * Vite stubs this module to `null` on the server (Solid UI cannot SSR). The
 * client must also render `null` for the hydration pass — otherwise preview
 * hits React #418 (server HTML has no Devtools node, client inserts one).
 * `useClientHydration` matches that stub on the first client render, then
 * mounts after hydrate.
 */
export function TanStackAppDevtools() {
  const hydrated = useClientHydration();
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
