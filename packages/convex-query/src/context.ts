import type { QueryClient, RootOf } from "@raf-query/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { AnyQueryReference, ConvexReader } from "./reader.ts";

/**
 * What the `convex` plugin declares: every `queryFn` on its client gets the
 * client's {@link ConvexReader} as `context.convex`.
 */
export interface Convex {
  readonly context: { readonly convex: ConvexReader };
}

/** A raf-query client that has the `convex` plugin: it runs this package's factories. */
export type ConvexQueryClient = QueryClient<RootOf<Convex>>;

/** What {@link readConvexQuery} reads from a `queryFn`'s context. */
export interface ConvexRequest {
  readonly convex: ConvexReader;
  readonly signal: AbortSignal;
}

/**
 * Read a Convex query from a `queryFn`, through the reader of the client
 * making the request. The read is dropped when raf-query aborts the
 * request, and rejects with a `ConvexQueryError`, so readers' error
 * boundaries get it as is.
 *
 * @example
 * queryOptions({
 *   queryKey: ["isSubscribed", endpoint],
 *   queryFn: (context) =>
 *     readConvexQuery(context, { args: { endpoint }, query: api.pushSubscriptions.isSubscribed }),
 * });
 */
export function readConvexQuery<TQuery extends AnyQueryReference>(
  request: ConvexRequest,
  read: { readonly args: FunctionArgs<TQuery>; readonly query: TQuery },
): Promise<FunctionReturnType<TQuery>> {
  return request.convex.query({ args: read.args, query: read.query, signal: request.signal });
}
