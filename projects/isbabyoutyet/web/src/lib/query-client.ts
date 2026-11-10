import type { QueryClient } from "@raf-query/react";
import { createQueryClient, recommended } from "@raf-query/react";
import type { ConvexWatchClient } from "@workspace/convex-query";
import { convexLink, convexLive, ConvexReader } from "@workspace/convex-query";
import { browserOnly } from "@/lib/browser-only";

/**
 * The app's raf-query client. Convex queries read through `reader` (the
 * request's authenticated HTTP snapshot on the server, the subscribing
 * websocket client in the browser), and `live`, in the browser, keeps every
 * cached Convex entry subscribed while a provider has the client mounted.
 * `recommended()` adds retries and refetching stale queries on focus and
 * reconnect; Convex queries opt out of both (`retry: false`, never stale).
 *
 * Typed as a plain `QueryClient`: the app's factories use the unbound
 * builders, so nothing checks `meta` against the client's links, and a
 * client typed by its root trips `setData`'s overload inference.
 */
export function makeQueryClient(opts: {
  isServer: boolean;
  /** Browser only: the subscribing client that keeps Convex entries live. */
  live: ConvexWatchClient | null;
  reader: ConvexReader["Service"];
}): QueryClient {
  const preset = recommended();
  return createQueryClient({
    features: opts.live ? [...preset.features, convexLive(opts.live)] : preset.features,
    isServer: opts.isServer,
    links: [...preset.links, browserOnly, convexLink(opts.reader)],
  });
}

/** A browser client over one subscribing Convex client: reads and live sync. */
export function makeBrowserQueryClient(client: ConvexWatchClient) {
  return makeQueryClient({
    isServer: false,
    live: client,
    reader: ConvexReader.subscribing(client),
  });
}
