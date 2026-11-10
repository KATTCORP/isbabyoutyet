import { createQueryClient, recommended } from "@raf-query/react";
import type { ConvexWatchClient } from "@workspace/convex-query";
import { convexLink, convexLive, ConvexReader } from "@workspace/convex-query";

/**
 * The app's raf-query client. Convex queries read through `reader` (the
 * request's authenticated HTTP snapshot on the server, the subscribing
 * websocket client in the browser), and `live`, in the browser, keeps every
 * cached Convex entry subscribed while a provider has the client mounted.
 * `recommended()` adds retries and refetching stale queries on focus and
 * reconnect; Convex queries opt out of both (`retry: false`, never stale).
 */
export function makeQueryClient(opts: {
  isServer: boolean;
  /** Browser only: the subscribing client that keeps Convex entries live. */
  live: ConvexWatchClient | null;
  reader: ConvexReader["Service"];
}) {
  const preset = recommended();
  return createQueryClient({
    features: opts.live ? [...preset.features, convexLive(opts.live)] : preset.features,
    isServer: opts.isServer,
    links: [...preset.links, convexLink(opts.reader)],
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
