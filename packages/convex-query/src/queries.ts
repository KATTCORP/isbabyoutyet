import type {
  InfiniteData,
  InfiniteQueryOptions,
  QueryHandle,
  QueryOptions,
  QueryOptionsBuilder,
} from "@raf-query/react";
import { infiniteQueryOptions, queryOptions } from "@raf-query/react";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { getFunctionName } from "convex/server";
import { CONVEX_FEED_QUERY_KEY, CONVEX_PAGINATED_QUERY_KEY, CONVEX_QUERY_KEY } from "./entries.ts";
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

/** Which query a page of a {@link convexFeedQuery} came from. */
export type PageDirection = "backward" | "forward";

/**
 * A public Convex query a {@link convexFeedQuery} pages through. It takes
 * where the feed starts, `from` (an item's id, or `null` for the top), and
 * pages items that have ids, so the page can tell whether a feed shows an
 * item.
 */
export type FeedQueryReference = FunctionReference<
  "query",
  "public",
  { from: string | null; paginationOpts: PaginationOptions },
  PaginationResult<{ readonly _id: string }>
>;

/** A feed query's args without the `from` and `paginationOpts` the feed adds. */
export type FeedArgs<TQuery extends FeedQueryReference> = Omit<
  FunctionArgs<TQuery>,
  "from" | "paginationOpts"
>;

/** Page param of a {@link convexFeedQuery}: a cursor into one direction's query. */
export interface FeedPageParam {
  readonly cursor: string | null;
  readonly direction: PageDirection;
  /** Where the feed starts, the same on every page of an entry. */
  readonly from: string | null;
  /**
   * A backward page's param for the page after it in `pages`, so a refetch,
   * which walks forward from the first page, retraces the backward pages
   * towards the start. `null` on forward pages.
   */
  readonly next: FeedPageParam | null;
  readonly numItems: number;
}

/** The two Convex queries of a {@link convexFeedQuery}. */
export interface FeedQueries<
  TForward extends FeedQueryReference,
  TBackward extends FeedQueryReference,
> {
  /** Items newer than where the feed starts, oldest first, from `fetchPreviousPage`. */
  readonly backward: TBackward;
  /** The first page and every older page, from `fetchNextPage`. */
  readonly forward: TForward;
}

/** Input of a {@link convexFeedQuery} factory. */
export interface FeedInput<
  TForward extends FeedQueryReference,
  TBackward extends FeedQueryReference,
> {
  /** Args both queries take: which feed. Its key. */
  readonly args: FeedArgs<TForward> & FeedArgs<TBackward>;
  /**
   * Where the feed starts. Not part of its key: an entry keeps the start it
   * was loaded with while its pages show `from`.
   */
  readonly from: string | null;
  /** Page size, in both directions. */
  readonly numItems: number;
}

/** Either direction's page of a {@link convexFeedQuery}. */
type FeedPage<TForward extends FeedQueryReference, TBackward extends FeedQueryReference> =
  | FunctionReturnType<TBackward>
  | FunctionReturnType<TForward>;

/** The raf-query factory {@link convexFeedQuery} returns. */
export type ConvexFeedQueryFactory<
  TForward extends FeedQueryReference,
  TBackward extends FeedQueryReference,
> = (
  input: FeedInput<TForward, TBackward>,
) => InfiniteQueryOptions<
  readonly [
    typeof CONVEX_FEED_QUERY_KEY,
    string,
    string,
    FeedArgs<TForward> & FeedArgs<TBackward>,
    number,
  ],
  FeedPage<TForward, TBackward>,
  FeedPageParam,
  InfiniteData<FeedPage<TForward, TBackward>, FeedPageParam>,
  UnboundRoot
>;

function feedPageArgs<TQuery extends FeedQueryReference>(
  args: FeedArgs<TQuery>,
  param: FeedPageParam,
): FunctionArgs<TQuery>;
function feedPageArgs(args: DefaultFunctionArgs, param: FeedPageParam) {
  return {
    ...args,
    from: param.from,
    paginationOpts: { cursor: param.cursor, numItems: param.numItems },
  };
}

/** Whether `data`, a feed entry's, starts at `from` or shows the item `from` names. */
function feedShows(
  data: InfiniteData<PaginationResult<{ readonly _id: string }>, FeedPageParam>,
  from: string | null,
) {
  if (data.pageParams[0]?.from === from) {
    return true;
  }
  return from !== null && data.pages.some((page) => page.page.some((item) => item._id === from));
}

/**
 * A feed: one infinite query per `args` that opens at an item (`from`) or
 * at the top, and grows both ways over two cursor-paginated Convex
 * queries. `forward` loads the first page and every older page
 * (`fetchNextPage`); `backward` loads newer pages (`fetchPreviousPage`),
 * starting right above the first page. raf-query prepends backward pages,
 * so `pages` reads in feed order as long as each backward page is
 * reversed. Every page stays live through `convexLive`, pinned like
 * {@link convexPaginatedQuery}'s.
 *
 * Where the feed starts rides in its page params, not its key, so every
 * start shares one entry. `load` keeps its pages while they start at `from`
 * or show the item `from` names (raf-query's `keepPages`): moving between
 * items the page shows, or back and forward, reads nothing. Any other
 * `from` starts the feed over there.
 *
 * @example
 * // loader: the feed, opened at `?item=`
 * timeline: swr(feedQuery, { args: { babyId }, from: deps.item, numItems: 20 }),
 */
export function convexFeedQuery<
  TForward extends FeedQueryReference,
  TBackward extends FeedQueryReference,
>(queries: FeedQueries<TForward, TBackward>): ConvexFeedQueryFactory<TForward, TBackward> {
  const forwardName = getFunctionName(queries.forward);
  const backwardName = getFunctionName(queries.backward);
  const memoKey = JSON.stringify([CONVEX_FEED_QUERY_KEY, forwardName, backwardName]);
  return memoized(memoKey, (): ConvexFeedQueryFactory<TForward, TBackward> => (input) => {
    const initialPageParam: FeedPageParam = {
      cursor: null,
      direction: "forward",
      from: input.from,
      next: null,
      numItems: input.numItems,
    };
    return infiniteQueryOptions({
      ...LIVE_OPTIONS,
      // raf-query passes (lastPage, pages, lastPageParam) here and
      // (firstPage, pages, firstPageParam) below; the rest parameters keep
      // to `max-params`. Each param carries the entry's `from` on.
      getNextPageParam: (
        ...params: [
          lastPage: FeedPage<TForward, TBackward>,
          pages: unknown,
          lastPageParam: FeedPageParam,
        ]
      ): FeedPageParam | null => {
        const lastPageParam = params[2];
        if (lastPageParam.direction === "backward") {
          return lastPageParam.next;
        }
        return params[0].isDone
          ? null
          : {
              cursor: params[0].continueCursor,
              direction: "forward",
              from: lastPageParam.from,
              next: null,
              numItems: input.numItems,
            };
      },
      getPreviousPageParam: (
        ...params: [
          firstPage: FeedPage<TForward, TBackward>,
          pages: unknown,
          firstPageParam: FeedPageParam,
        ]
      ): FeedPageParam | null => {
        const firstPage = params[0];
        const firstPageParam = params[2];
        if (firstPageParam.direction === "forward") {
          return {
            cursor: null,
            direction: "backward",
            from: firstPageParam.from,
            next: firstPageParam,
            numItems: input.numItems,
          };
        }
        return firstPage.isDone
          ? null
          : {
              cursor: firstPage.continueCursor,
              direction: "backward",
              from: firstPageParam.from,
              next: firstPageParam,
              numItems: input.numItems,
            };
      },
      initialPageParam,
      // Every start shares the entry: `load` keeps its pages while they
      // start at `from` or show it, and starts over at `from` otherwise.
      keepPages: (data) => feedShows(data, input.from),
      queryFn: (context): Promise<FeedPage<TForward, TBackward>> =>
        context.pageParam.direction === "forward"
          ? runConvexEffect(
              context,
              readConvexQuery(
                queries.forward,
                feedPageArgs<TForward>(input.args, context.pageParam),
              ),
            )
          : runConvexEffect(
              context,
              readConvexQuery(
                queries.backward,
                feedPageArgs<TBackward>(input.args, context.pageParam),
              ),
            ),
      queryKey: [CONVEX_FEED_QUERY_KEY, forwardName, backwardName, input.args, input.numItems],
    });
  });
}

/** Handle of a {@link convexQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexQueryHandle<TQuery extends QueryReference> = QueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Handle of a {@link convexPaginatedQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexPaginatedQueryHandle<TQuery extends PaginatedQueryReference> = QueryHandle<
  ConvexPaginatedQueryFactory<TQuery>
>;

/** Handle of a {@link convexFeedQuery} entry, from `load` or `waterfallHandle`. */
export type ConvexFeedQueryHandle<
  TForward extends FeedQueryReference,
  TBackward extends FeedQueryReference,
> = QueryHandle<ConvexFeedQueryFactory<TForward, TBackward>>;
