import type { QueryClient, QueryFunctionContext } from "@raf-query/react";
import { link } from "@raf-query/react";
import type { Context } from "effect";
import { Effect } from "effect";
import { ConvexReader } from "./reader.ts";

/** Each client's reader, set by its {@link convexLink}. */
const readers = new WeakMap<QueryClient, Context.Context<ConvexReader>>();

/**
 * The raf-query link Convex queries need on their client: it gives the
 * client a {@link ConvexReader}, which {@link runConvexEffect} runs `queryFn`
 * Effects with. Each client takes its own (a server request's authenticated
 * HTTP reader, or the browser's subscribing one), so a reader never serves
 * another request.
 *
 * @example
 * createQueryClient({ links: [convexLink(ConvexReader.snapshot(convexHttpClient))] });
 */
export function convexLink(reader: ConvexReader["Service"]) {
  const context = ConvexReader.context(reader);
  return link((op, next) => {
    readers.set(op.client, context);
    return next(op);
  });
}

/** What {@link runConvexEffect} reads from a `queryFn`'s context. */
type RequestContext = Pick<QueryFunctionContext, "client" | "signal">;

function readerContext(request: RequestContext) {
  const context = readers.get(request.client);
  if (!context) {
    throw new Error(
      "No ConvexReader for this query: create its QueryClient with the convexLink link.",
    );
  }
  return context;
}

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
  return Effect.runPromiseWith(readerContext(request))(effect, { signal: request.signal });
}
