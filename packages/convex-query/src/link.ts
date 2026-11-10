import type { InfiniteData, Operation, QueryFunctionContext } from "@raf-query/react";
import { link } from "@raf-query/react";
import { Context, Effect, Predicate } from "effect";
import type { EntryData } from "./entries.ts";
import { liveKey, loadedPages, pageIndex } from "./entries.ts";
import { ConvexReader } from "./reader.ts";

/**
 * Where {@link convexLink} puts its token on a request's `meta`. A symbol,
 * so it never collides with a query's own fields and stays out of targets
 * that match on them.
 */
const READER = Symbol("@workspace/convex-query/reader");

/** Each {@link convexLink}'s token, and the reader it stands for. */
const readers = new WeakMap<object, Context.Context<ConvexReader>>();

function isInfiniteData(value: EntryData): value is InfiniteData<EntryData> {
  return Predicate.hasProperty(value, "pages") && Array.isArray(value.pages);
}

/**
 * The entry's data when `op`'s request lands, keeping what the live sync
 * wrote while the request was in flight. raf-query writes a request's result
 * over whatever the entry holds, which would put back data the request read
 * before a newer live result arrived, and the live subscription only writes
 * again on the next change. So a Convex entry keeps what was written during
 * the request: a plain query its current value, a paged one each page the
 * live sync rewrote that the result still starts at the same cursor.
 */
function keepLiveWrites(op: Operation, result: EntryData): EntryData {
  const key = liveKey(op.queryKey);
  const current = op.client["~entries"].get(op.hash)?.state;
  if (!key || !op.hasData || !current?.hasData || current.data === op.data) {
    return result;
  }
  if (key.kind === "query") {
    return current.data;
  }
  const before = op.data;
  const now = current.data;
  const resultStarts = loadedPages(result);
  const beforeStarts = loadedPages(before);
  const nowStarts = loadedPages(now);
  if (
    !isInfiniteData(result) ||
    !isInfiniteData(before) ||
    !isInfiniteData(now) ||
    !resultStarts ||
    !beforeStarts ||
    !nowStarts
  ) {
    return result;
  }
  return {
    pageParams: result.pageParams,
    pages: result.pages.map((page, index) => {
      const start = resultStarts[index];
      const nowIndex = start ? pageIndex(nowStarts, start) : -1;
      const beforeIndex = start ? pageIndex(beforeStarts, start) : -1;
      const written = now.pages[nowIndex];
      return nowIndex !== -1 && beforeIndex !== -1 && written !== before.pages[beforeIndex]
        ? written
        : page;
    }),
  };
}

/**
 * The raf-query link Convex queries need on their client:
 *
 * - It gives every request a {@link ConvexReader}, for
 *   {@link runConvexEffect} to run `queryFn` Effects with. Each client takes
 *   its own (a server request's authenticated HTTP reader, or the browser's
 *   subscribing one), so a reader never serves another request.
 * - It keeps what `convexLive` writes while a request is in flight, which
 *   the request's older result would otherwise overwrite.
 *
 * @example
 * createQueryClient({ links: [convexLink(ConvexReader.snapshot(convexHttpClient))] });
 */
export function convexLink(reader: ConvexReader["Service"]) {
  const token = {};
  readers.set(token, ConvexReader.context(reader));
  return link(async (op, next) => {
    const result = await next({ ...op, meta: { ...op.meta, [READER]: token } });
    return keepLiveWrites(op, result);
  });
}

/** What {@link runConvexEffect} reads from a `queryFn`'s context. */
type RequestContext = Pick<QueryFunctionContext, "meta" | "signal">;

function readerContext(request: RequestContext) {
  const token = Predicate.hasProperty(request.meta, READER) ? request.meta[READER] : undefined;
  const context = Predicate.isObject(token) ? readers.get(token) : undefined;
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
