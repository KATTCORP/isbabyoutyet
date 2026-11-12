import type { Plugin } from "@raf-query/react";
import { plugin } from "@raf-query/react";
import type { Convex } from "./context.ts";
import { liveSync } from "./live.ts";
import type { ConvexReader, ConvexWatchClient } from "./reader.ts";

/**
 * The raf-query plugin Convex queries need on their client. It gives every
 * `queryFn` the client's {@link ConvexReader} (a server request's
 * authenticated HTTP reader, or the browser's subscribing one), so a reader
 * never serves another request. With a `live` client it also keeps every
 * cached Convex entry subscribed while a `QueryClientProvider` has the
 * client mounted, and writes each result into the cache; a server client
 * passes `null`.
 *
 * A client without it doesn't type-check where it meets a factory from this
 * package: in `load`, `setData` and the other verbs.
 *
 * @example
 * createQueryClient({
 *   plugins: [
 *     ...recommended(),
 *     isServer
 *       ? convex({ live: null, reader: snapshotReader(convexHttpClient) })
 *       : convex({ live: convexReactClient, reader: subscribingReader(convexReactClient) }),
 *   ],
 * });
 */
export function convex(opts: {
  /** Browser only: the subscribing client that keeps cached entries live. */
  readonly live: ConvexWatchClient | null;
  readonly reader: ConvexReader;
}): Plugin<Convex> {
  const context: Convex["context"] = { convex: opts.reader };
  return opts.live
    ? plugin<Convex>({ context, setup: liveSync(opts.live) })
    : plugin<Convex>({ context });
}
