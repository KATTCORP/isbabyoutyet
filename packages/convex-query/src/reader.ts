import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { getFunctionName } from "convex/server";
import { isPlainObject, isString } from "@workspace/runtime/guards";

/** A Convex query function reference, public or internal. */
export type AnyQueryReference = FunctionReference<"query">;

/** A Convex query failed: the function threw, or the client could not run it. */
export class ConvexQueryError extends Error {
  readonly functionName: string;
  override readonly name = "ConvexQueryError";

  constructor(opts: { cause: unknown; functionName: string }) {
    const cause = opts.cause;
    // The Convex error's message, so error boundaries show what the function threw.
    super(
      isPlainObject(cause) || cause instanceof Error
        ? messageOf(cause, opts.functionName)
        : fallbackMessage(opts.functionName),
      { cause },
    );
    this.functionName = opts.functionName;
  }
}

function fallbackMessage(functionName: string) {
  return `Convex query \`${functionName}\` failed`;
}

function messageOf(cause: object, functionName: string) {
  return "message" in cause && isString(cause.message)
    ? cause.message
    : fallbackMessage(functionName);
}

/** One subscription to a query, as `ConvexReactClient.watchQuery` returns it. */
export interface ConvexWatch<TValue> {
  /** The latest result, `undefined` before the first. Throws the query's error. */
  localQueryResult(): TValue | undefined;
  /** Subscribe; the query stays live until the returned function is called. */
  onUpdate(callback: () => void): () => void;
}

/** The subscribing half of `ConvexReactClient`: what the browser and the live sync need. */
export interface ConvexWatchClient {
  watchQuery<TQuery extends AnyQueryReference>(
    query: TQuery,
    args: FunctionArgs<TQuery>,
  ): ConvexWatch<FunctionReturnType<TQuery>>;
}

/** The snapshot half of `ConvexHttpClient`: SSR reads every query at one timestamp. */
export interface ConvexSnapshotClient {
  consistentQuery<TQuery extends AnyQueryReference>(
    query: TQuery,
    args: FunctionArgs<TQuery>,
  ): Promise<FunctionReturnType<TQuery>>;
}

/**
 * How long a browser read keeps its subscription after the first result. The
 * live sync subscribes to the same query once the cache has its data; this
 * bridges the gap so Convex shares one subscription instead of re-sending
 * the query.
 */
const KEEP_SUBSCRIBED_MS = 5000;

function queryError(opts: { cause: unknown; query: AnyQueryReference }) {
  return new ConvexQueryError({ cause: opts.cause, functionName: getFunctionName(opts.query) });
}

/** One read: the query, its args, and the signal that drops it. */
interface ConvexRead<TQuery extends AnyQueryReference> {
  readonly args: FunctionArgs<TQuery>;
  readonly query: TQuery;
  /** Aborted when raf-query drops the request; the read rejects with its reason. */
  readonly signal: AbortSignal;
}

/**
 * Reads Convex queries for raf-query `queryFn`s. Each `QueryClient` gets its
 * own through the `convex` part, so a server request's authenticated HTTP
 * client can't serve another request. A read rejects with a
 * {@link ConvexQueryError}.
 */
export interface ConvexReader {
  query<TQuery extends AnyQueryReference>(
    read: ConvexRead<TQuery>,
  ): Promise<FunctionReturnType<TQuery>>;
}

/**
 * Browser reads over a subscribing client: resolves with the first result
 * (at once if the client already has it), and keeps the subscription a
 * moment longer for the live sync to pick up.
 */
export function subscribingReader(client: ConvexWatchClient): ConvexReader {
  return {
    query: (read) => {
      const settled = Promise.withResolvers<FunctionReturnType<typeof read.query>>();
      const watch = client.watchQuery(read.query, read.args);
      let done = false;
      const stop = (unsubscribe: () => void) => {
        done = true;
        read.signal.removeEventListener("abort", onAbort);
        unsubscribe();
      };
      const settle = () => {
        if (done) {
          return;
        }
        let result;
        try {
          result = watch.localQueryResult();
        } catch (error) {
          stop(unsubscribe);
          settled.reject(queryError({ cause: error, query: read.query }));
          return;
        }
        if (result === undefined) {
          return;
        }
        stop(() => setTimeout(unsubscribe, KEEP_SUBSCRIBED_MS));
        settled.resolve(result);
      };
      const onAbort = () => {
        if (!done) {
          stop(unsubscribe);
          settled.reject(read.signal.reason);
        }
      };
      const unsubscribe = watch.onUpdate(settle);
      read.signal.addEventListener("abort", onAbort);
      if (read.signal.aborted) {
        onAbort();
      } else {
        settle();
      }
      return settled.promise;
    },
  };
}

/** Server reads: one consistent snapshot per HTTP client (one per request). */
export function snapshotReader(client: ConvexSnapshotClient): ConvexReader {
  return {
    query: async (read) => {
      try {
        return await client.consistentQuery(read.query, read.args);
      } catch (error) {
        throw queryError({ cause: error, query: read.query });
      }
    },
  };
}
