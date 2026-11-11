import { createQueryClient, recommended } from "@raf-query/react";
import type { ConvexWatchClient } from "@workspace/convex-query";
import { convex, ConvexReader } from "@workspace/convex-query";

/**
 * The app's raf-query client. Convex queries read through `reader` (the
 * request's authenticated HTTP snapshot on the server, the subscribing
 * websocket client in the browser), and `live`, in the browser, keeps every
 * cached Convex entry subscribed while a provider has the client mounted.
 * `recommended()` adds retries and refetching stale queries on focus and
 * reconnect; Convex queries opt out of both (`retry: false`, never stale).
 *
 * Its parts type what the app's queries can set and what their `queryFn`s
 * get: build factories with the builders in [`raf.ts`](./raf.ts), which are
 * bound to this client.
 */
export function makeQueryClient(opts: {
  isServer: boolean;
  /** Browser only: the subscribing client that keeps Convex entries live. */
  live: ConvexWatchClient | null;
  reader: ConvexReader["Service"];
}) {
  return createQueryClient({
    isServer: opts.isServer,
    parts: [...recommended(), convex({ live: opts.live, reader: opts.reader })],
  });
}

/** The app's query client: what loaders, the router context and tests pass around. */
export type AppQueryClient = ReturnType<typeof makeQueryClient>;

/** A browser client over one subscribing Convex client: reads and live sync. */
export function makeBrowserQueryClient(client: ConvexWatchClient) {
  return makeQueryClient({
    isServer: false,
    live: client,
    reader: ConvexReader.subscribing(client),
  });
}
