import type { QueryClient, QueryFunctionContext, RootOf } from "@raf-query/react";
import { Effect } from "effect";
import { ConvexReader } from "./reader.ts";

/**
 * What the `convex` part declares: every `queryFn` on its client gets the
 * client's {@link ConvexReader} as `context.convex`.
 */
export interface Convex {
  readonly context: { readonly convex: ConvexReader["Service"] };
}

/** A raf-query client that has the `convex` part: it runs this package's factories. */
export type ConvexQueryClient = QueryClient<RootOf<Convex>>;

/** What {@link runConvexEffect} reads from a `queryFn`'s context. */
type RequestContext = Pick<
  QueryFunctionContext<ReadonlyArray<unknown>, RootOf<Convex>>,
  "convex" | "signal"
>;

/**
 * Run a `queryFn`'s Effect with the client's {@link ConvexReader}, and
 * interrupt it when raf-query aborts the request. A failure rejects with the
 * Effect's error, so readers' error boundaries get it as is.
 *
 * @example
 * queryOptions({
 *   queryKey: ["pushCapability", babyRef],
 *   queryFn: (context) => runConvexEffect(context, resolvePushCapability(babyRef)),
 * });
 */
export function runConvexEffect<A, E>(
  request: RequestContext,
  effect: Effect.Effect<A, E, ConvexReader>,
): Promise<A> {
  return Effect.runPromiseWith(ConvexReader.context(request.convex))(effect, {
    signal: request.signal,
  });
}
