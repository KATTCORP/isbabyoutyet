import { QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import type { ReactElement, ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n";
import type { ConvexTestHarness } from "@/test/convexTestHarness";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";

/**
 * Renders under the production Convex + React Query provider stack, backed by
 * `convex-test` instead of stubbed query data — inside a real memory router
 * (production always has one; guarded forms mount a navigation blocker).
 */
export async function renderWithConvexTest(opts: {
  harness: ConvexTestHarness;
  ui: ReactElement;
  wrap: ((children: ReactNode) => ReactNode) | null;
}) {
  const wrapped = opts.wrap ? opts.wrap(opts.ui) : opts.ui;
  return await renderWithTestRouter(
    <LocaleProvider locale="en-GB">
      <QueryClientProvider client={opts.harness.queryClient}>
        <ConvexProvider
          // @ts-expect-error — integration client is not ConvexReactClient
          client={opts.harness.convexClient}
        >
          {wrapped}
        </ConvexProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}
