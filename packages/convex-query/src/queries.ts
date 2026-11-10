import type {
  InfiniteData,
  InfiniteQueryOptions,
  QueryClient,
  QueryHandle,
  QueryOptions,
  QueryOptionsBuilder,
} from "@raf-query/react";
import {
  getData,
  infiniteQueryOptions,
  load,
  queryOptions,
  removeOne,
  setData,
  swr,
} from "@raf-query/react";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { getFunctionName } from "convex/server";
import {
  CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
  CONVEX_PAGINATED_QUERY_KEY,
  CONVEX_QUERY_KEY,
} from "./entries.ts";
import { runConvexEffect } from "./link.ts";
import { readConvexQuery } from "./reader.ts";

/**
 * Factories by what they read. raf-query matches a factory target by
 * identity, so every `convexQuery(api.profile.get)` must be the same factory
 * for `invalidateMany(client, convexQuery(api.profile.get))` to reach entries
 * another call created. Function references are proxies, so key by name.
 */
const factories = new Map<string, object>();

// Each key is only ever set by the `make` of one factory kind and names, so
// what it holds is what that `make` returns.
function memoized<TFactory extends object>(key: string, make: () => TFactory): TFactory;
function memoized(key: string, make: () => object) {
  const existing = factories.get(key);
  if (existing) {
    return existing;
  }
  const made = make();
  factories.set(key, made);
  return made;
}

/** Convex data is live (see `convexLive`), so it never goes stale, and its errors are deterministic. */
const LIVE_OPTIONS = { meta: { retry: false }, staleTime: Infinity } as const;

/** A public Convex query. */
export type QueryReference = FunctionReference<"query", "public">;

/** A public Convex query that takes `paginationOpts` and returns a page. */
export type PaginatedQueryReference = FunctionReference<
  "query",
  "public",
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>;

/** A paginated query's args without the `paginationOpts` each page fetch adds. */
export type PaginationArgs<TQuery extends PaginatedQueryReference> = Omit<
  FunctionArgs<TQuery>,
  "paginationOpts"
>;

/** Input of a {@link convexPaginatedQuery} factory. */
export interface PaginatedQueryInput<TQuery extends PaginatedQueryReference> {
  readonly args: PaginationArgs<TQuery>;
  /** Page size, for the first page and every page after it. */
  readonly numItems: number;
}

/**
 * The root of the unbound `queryOptions` builders, which factories here are
 * built with: verbs take any client for them, whatever its links.
 */
type UnboundRoot = typeof queryOptions extends QueryOptionsBuilder<infer TTypes> ? TTypes : never;

/** The raf-query factory {@link convexQuery} returns for `TQuery`. */
export type ConvexQueryFactory<TQuery extends QueryReference> = (
  args: FunctionArgs<TQuery>,
) => QueryOptions<
  readonly [typeof CONVEX_QUERY_KEY, string, FunctionArgs<TQuery>],
  FunctionReturnType<TQuery>,
  FunctionReturnType<TQuery>,
  UnboundRoot
>;

/** The raf-query factory {@link convexPaginatedQuery} returns for `TQuery`. */
export type ConvexPaginatedQueryFactory<TQuery extends PaginatedQueryReference> = (
  input: PaginatedQueryInput<TQuery>,
) => InfiniteQueryOptions<
  readonly [typeof CONVEX_PAGINATED_QUERY_KEY, string, PaginationArgs<TQuery>, number],
  FunctionReturnType<TQuery>,
  PaginationOptions,
  InfiniteData<FunctionReturnType<TQuery>, PaginationOptions>,
  UnboundRoot
>;

/**
 * The raf-query factory for a Convex query: its input is the function's args.
 * Data stays live through `convexLive`, so it never goes stale. Call it
 * inline: every call for the same query returns the same factory, and
 * entries are keyed by function name and args.
 *
 * @example
 * // loader
 * const [handles] = await load(queryClient, { profile: swr(convexQuery(api.profile.get), {}) });
 * // component
 * const [profileThenable] = useQuery(convexQuery(api.profile.get), loaderData.profile);
 * const profile = use(profileThenable);
 */
export function convexQuery<TQuery extends QueryReference>(
  query: TQuery,
): ConvexQueryFactory<TQuery> {
  const functionName = getFunctionName(query);
  return memoized(
    JSON.stringify([CONVEX_QUERY_KEY, functionName]),
    (): ConvexQueryFactory<TQuery> => (args) =>
      queryOptions({
        ...LIVE_OPTIONS,
        queryFn: (context) => runConvexEffect(context, readConvexQuery(query, args)),
        queryKey: [CONVEX_QUERY_KEY, functionName, args],
      }),
  );
}

function pageArgs<TQuery extends PaginatedQueryReference>(
  args: PaginationArgs<TQuery>,
  paginationOpts: PaginationOptions,
): FunctionArgs<TQuery>;
function pageArgs(args: DefaultFunctionArgs, paginationOpts: PaginationOptions) {
  return { ...args, paginationOpts };
}

/**
 * The raf-query factory for a cursor-paginated Convex query. Pages load with
 * `fetchNextPage`; every loaded page stays live through `convexLive`. Like
 * {@link convexQuery}, call it inline.
 *
 * @example
 * timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), { args: { babyId }, numItems: 20 }),
 */
export function convexPaginatedQuery<TQuery extends PaginatedQueryReference>(
  query: TQuery,
): ConvexPaginatedQueryFactory<TQuery> {
  const functionName = getFunctionName(query);
  return memoized(
    JSON.stringify([CONVEX_PAGINATED_QUERY_KEY, functionName]),
    (): ConvexPaginatedQueryFactory<TQuery> => (input) => {
      const initialPageParam: PaginationOptions = { cursor: null, numItems: input.numItems };
      return infiniteQueryOptions({
        ...LIVE_OPTIONS,
        getNextPageParam: (lastPage: FunctionReturnType<TQuery>): PaginationOptions | null =>
          lastPage.isDone ? null : { cursor: lastPage.continueCursor, numItems: input.numItems },
        initialPageParam,
        queryFn: (context) =>
          runConvexEffect(
            context,
            readConvexQuery(query, pageArgs<TQuery>(input.args, context.pageParam)),
          ),
        queryKey: [CONVEX_PAGINATED_QUERY_KEY, functionName, input.args, input.numItems],
      });
    },
  );
}

/** Which query a page of a {@link convexBidirectionalPaginatedQuery} came from. */
export type PageDirection = "backward" | "forward";

/** Page param of a {@link convexBidirectionalPaginatedQuery}: a cursor into one direction's query. */
export interface BidirectionalPageParam {
  readonly cursor: string | null;
  readonly direction: PageDirection;
  /**
   * A backward page's param for the page after it in `pages`, so a refetch,
   * which walks forward from the first page, retraces the backward pages
   * towards the start. `null` on forward pages.
   */
  readonly next: BidirectionalPageParam | null;
  readonly numItems: number;
}

/** The two Convex queries of a {@link convexBidirectionalPaginatedQuery}. */
export interface BidirectionalPaginatedQueries<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> {
  /** Pages before the start, oldest-loaded first, from `fetchPreviousPage`. */
  readonly backward: TBackward;
  /** The first page and every page after it, from `fetchNextPage`. */
  readonly forward: TForward;
}

/** Input of a {@link convexBidirectionalPaginatedQuery} factory: args both queries take. */
export interface BidirectionalPaginatedQueryInput<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> {
  readonly args: PaginationArgs<TForward> & PaginationArgs<TBackward>;
  /** Page size, in both directions. */
  readonly numItems: number;
}

/** The raf-query factory {@link convexBidirectionalPaginatedQuery} returns. */
export type ConvexBidirectionalPaginatedQueryFactory<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> = (
  input: BidirectionalPaginatedQueryInput<TForward, TBackward>,
) => InfiniteQueryOptions<
  readonly [
    typeof CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
    string,
    string,
    PaginationArgs<TForward> & PaginationArgs<TBackward>,
    number,
  ],
  FunctionReturnType<TBackward> | FunctionReturnType<TForward>,
  BidirectionalPageParam,
  InfiniteData<
    FunctionReturnType<TBackward> | FunctionReturnType<TForward>,
    BidirectionalPageParam
  >,
  UnboundRoot
>;

/** Either direction's page of a {@link convexBidirectionalPaginatedQuery}. */
type BidirectionalPage<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> = FunctionReturnType<TBackward> | FunctionReturnType<TForward>;

/**
 * An infinite query that grows from a starting point in both directions,
 * over two cursor-paginated Convex queries with the same args: `forward`
 * loads the first page and every `fetchNextPage`, `backward` loads every
 * `fetchPreviousPage`, starting right before the first page and moving away
 * from it. raf-query prepends backward pages, so `pages` reads in feed order
 * as long as each backward page is reversed. Nothing loads backward until
 * `fetchPreviousPage` is called, unless the entry is loaded with
 * {@link loadBidirectionalPaginatedQuery}. Every page stays live through
 * `convexLive`, pinned like {@link convexPaginatedQuery}'s.
 *
 * @example
 * // A linked item, older items on scroll, newer ones on demand.
 * feed: swr(
 *   convexBidirectionalPaginatedQuery({
 *     backward: api.timeline.listNewerThanItem,
 *     forward: api.timeline.listFromItem,
 *   }),
 *   { args: { babyId, itemId }, numItems: 20 },
 * ),
 */
export function convexBidirectionalPaginatedQuery<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
>(
  queries: BidirectionalPaginatedQueries<TForward, TBackward>,
): ConvexBidirectionalPaginatedQueryFactory<TForward, TBackward> {
  const forwardName = getFunctionName(queries.forward);
  const backwardName = getFunctionName(queries.backward);
  const memoKey = JSON.stringify([
    CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
    forwardName,
    backwardName,
  ]);
  return memoized(
    memoKey,
    (): ConvexBidirectionalPaginatedQueryFactory<TForward, TBackward> => (input) => {
      const initialPageParam: BidirectionalPageParam = {
        cursor: null,
        direction: "forward",
        next: null,
        numItems: input.numItems,
      };
      return infiniteQueryOptions({
        ...LIVE_OPTIONS,
        // raf-query passes (lastPage, pages, lastPageParam) here and
        // (firstPage, pages, firstPageParam) below; the rest parameters keep
        // to `max-params`.
        getNextPageParam: (
          ...params: [
            lastPage: BidirectionalPage<TForward, TBackward>,
            pages: unknown,
            lastPageParam: BidirectionalPageParam,
          ]
        ): BidirectionalPageParam | null => {
          const lastPageParam = params[2];
          if (lastPageParam.direction === "backward") {
            return lastPageParam.next;
          }
          return params[0].isDone
            ? null
            : {
                cursor: params[0].continueCursor,
                direction: "forward",
                next: null,
                numItems: input.numItems,
              };
        },
        getPreviousPageParam: (
          ...params: [
            firstPage: BidirectionalPage<TForward, TBackward>,
            pages: unknown,
            firstPageParam: BidirectionalPageParam,
          ]
        ): BidirectionalPageParam | null => {
          const firstPage = params[0];
          const firstPageParam = params[2];
          if (firstPageParam.direction === "forward") {
            return {
              cursor: null,
              direction: "backward",
              next: firstPageParam,
              numItems: input.numItems,
            };
          }
          return firstPage.isDone
            ? null
            : {
                cursor: firstPage.continueCursor,
                direction: "backward",
                next: firstPageParam,
                numItems: input.numItems,
              };
        },
        initialPageParam,
        queryFn: (context): Promise<BidirectionalPage<TForward, TBackward>> => {
          const paginationOpts = {
            cursor: context.pageParam.cursor,
            numItems: context.pageParam.numItems,
          };
          return context.pageParam.direction === "forward"
            ? runConvexEffect(
                context,
                readConvexQuery(queries.forward, pageArgs<TForward>(input.args, paginationOpts)),
              )
            : runConvexEffect(
                context,
                readConvexQuery(queries.backward, pageArgs<TBackward>(input.args, paginationOpts)),
              );
        },
        queryKey: [
          CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
          forwardName,
          backwardName,
          input.args,
          input.numItems,
        ],
      });
    },
  );
}

/** Handle of a {@link convexQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexQueryHandle<TQuery extends QueryReference> = QueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Handle of a {@link convexPaginatedQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexPaginatedQueryHandle<TQuery extends PaginatedQueryReference> = QueryHandle<
  ConvexPaginatedQueryFactory<TQuery>
>;

/** Handle of a {@link convexBidirectionalPaginatedQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexBidirectionalPaginatedQueryHandle<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> = QueryHandle<ConvexBidirectionalPaginatedQueryFactory<TForward, TBackward>>;

/**
 * `load(queryClient, { feed: swr(convexBidirectionalPaginatedQuery(queries), input) })`
 * for an entry that opens with a short first backward page already loaded:
 * the `previousNumItems` items right before its first page, read in the same
 * `load` as that page rather than after it, so a loader can show a little
 * context above the start without a waterfall. Later `fetchPreviousPage`s
 * load full `numItems` pages; refetches and `convexLive` treat the short page
 * like any other backward page. An entry that already has backward pages is
 * loaded as cached. Resolves with the entry's handle and data, like `load`.
 *
 * @example
 * // The linked item, with the two items above it.
 * const [feed, feedData] = await loadBidirectionalPaginatedQuery(queryClient, {
 *   input: { args: { babyId, itemId }, numItems: 20 },
 *   previousNumItems: 2,
 *   queries: { backward: api.timeline.listNewerThanItem, forward: api.timeline.listFromItem },
 * });
 */
export async function loadBidirectionalPaginatedQuery<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
>(
  queryClient: QueryClient,
  opts: {
    input: BidirectionalPaginatedQueryInput<TForward, TBackward>;
    previousNumItems: number;
    queries: BidirectionalPaginatedQueries<TForward, TBackward>;
  },
): Promise<
  readonly [
    ConvexBidirectionalPaginatedQueryHandle<TForward, TBackward>,
    InfiniteData<BidirectionalPage<TForward, TBackward>, BidirectionalPageParam>,
  ]
> {
  const factory = convexBidirectionalPaginatedQuery(opts.queries);
  const loadAsCached = async () => {
    const [handles, data] = await load(queryClient, { feed: swr(factory, opts.input) });
    return [handles.feed, data.feed] as const;
  };
  if (getData(queryClient, factory, opts.input)?.pageParams[0]?.direction === "backward") {
    return loadAsCached();
  }
  // The short page is its own `convexQuery` entry, so it reads through the
  // client's reader alongside the feed's first page.
  const previousPage = convexQuery(opts.queries.backward);
  const previousArgs = pageArgs<TBackward>(opts.input.args, {
    cursor: null,
    numItems: opts.previousNumItems,
  });
  const [handles, loaded] = await load(queryClient, {
    feed: swr(factory, opts.input),
    previous: swr(previousPage, previousArgs),
  });
  // Read once, then folded into the feed, where the feed's own live page takes over.
  removeOne(queryClient, previousPage, previousArgs);
  const data = getData(queryClient, factory, opts.input);
  const first = data?.pageParams[0];
  // Another load may have seeded the entry while this one was reading.
  if (!data || first?.direction !== "forward") {
    return [handles.feed, data ?? loaded.feed] as const;
  }
  const previousParam: BidirectionalPageParam = {
    cursor: null,
    direction: "backward",
    next: first,
    numItems: opts.previousNumItems,
  };
  const seeded = {
    pageParams: [previousParam, ...data.pageParams],
    pages: [loaded.previous, ...data.pages],
  };
  setData(queryClient, factory, opts.input, seeded);
  return [handles.feed, seeded] as const;
}
