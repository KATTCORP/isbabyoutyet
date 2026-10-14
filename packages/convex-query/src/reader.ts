import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { getFunctionName } from "convex/server";
import { Context, Effect, Layer, Predicate, Schema } from "effect";

/** A Convex query function reference, public or internal. */
export type AnyQueryReference = FunctionReference<"query">;

/** A Convex query failed: the function threw, or the client could not run it. */
export class ConvexQueryError extends Schema.TaggedError<ConvexQueryError>()("ConvexQueryError", {
  cause: Schema.Defect(),
  functionName: Schema.String,
}) {
  /** The Convex error's message, so error boundaries show what the function threw. */
  override get message() {
    const cause = this.cause;
    return Predicate.hasProperty(cause, "message") && Predicate.isString(cause.message)
      ? cause.message
      : `Convex query \`${this.functionName}\` failed`;
  }
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

/**
 * Reads Convex queries for raf-query `queryFn`s. Each `QueryClient` gets its
 * own through `layer`, so a server request's authenticated HTTP client can't
 * serve another request.
 */
export class ConvexReader extends Context.Service<
  ConvexReader,
  {
    readonly query: <TQuery extends AnyQueryReference>(
      query: TQuery,
      args: FunctionArgs<TQuery>,
    ) => Effect.Effect<FunctionReturnType<TQuery>, ConvexQueryError>;
  }
>()("@workspace/convex-query/ConvexReader") {
  /**
   * Browser reads over a subscribing client: resolves with the first result
   * (at once if the client already has it), and keeps the subscription a
   * moment longer for the live sync to pick up.
   */
  static readonly layerWatch = (client: ConvexWatchClient) =>
    Layer.succeed(ConvexReader, {
      query: (query, args) =>
        Effect.callback((resume) => {
          const watch = client.watchQuery(query, args);
          let settled = false;
          const settle = () => {
            if (settled) {
              return;
            }
            let result;
            try {
              result = watch.localQueryResult();
            } catch (error) {
              settled = true;
              unsubscribe();
              resume(Effect.fail(queryError({ cause: error, query })));
              return;
            }
            if (result === undefined) {
              return;
            }
            settled = true;
            setTimeout(unsubscribe, KEEP_SUBSCRIBED_MS);
            resume(Effect.succeed(result));
          };
          const unsubscribe = watch.onUpdate(settle);
          settle();
          return Effect.sync(() => {
            if (!settled) {
              unsubscribe();
            }
          });
        }),
    });

  /** Server reads: one consistent snapshot per HTTP client (one per request). */
  static readonly layerSnapshot = (client: ConvexSnapshotClient) =>
    Layer.succeed(ConvexReader, {
      query: (query, args) =>
        Effect.tryPromise({
          catch: (cause) => queryError({ cause, query }),
          try: () => client.consistentQuery(query, args),
        }),
    });
}

/** Read a query through the current {@link ConvexReader}. */
export function readConvexQuery<TQuery extends AnyQueryReference>(
  query: TQuery,
  args: FunctionArgs<TQuery>,
) {
  return Effect.gen(function* () {
    const reader = yield* ConvexReader;
    return yield* reader.query(query, args);
  });
}
