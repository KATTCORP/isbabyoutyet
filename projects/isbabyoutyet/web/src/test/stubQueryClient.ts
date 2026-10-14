import { QueryClient } from "@raf-query/react";
import { ConvexReader } from "@workspace/convex-query";
import { makeTestConvexClient } from "@workspace/convex-query/testing";
import { makeAsyncResource } from "@isbabyoutyet/backend/convex/test.resource";

type QueryRunner = Parameters<typeof makeTestConvexClient>[0];

/**
 * A raf-query client whose Convex reads go to `run`, for unit tests of
 * loaders and guards that only need a query or two answered. A browser
 * client unless `opts.isServer`. Prefer `createConvexTestHarness` when the
 * test needs a real backend.
 */
export function stubQueryClientResource(
  run: QueryRunner,
  opts: { isServer: boolean } = { isServer: false },
) {
  const backend = makeTestConvexClient(run);
  const queryClient = new QueryClient({
    isServer: opts.isServer,
    layer: ConvexReader.layerWatch(backend.client),
  });
  return makeAsyncResource({ backend, queryClient }, async () => {
    await queryClient.dispose();
  });
}
