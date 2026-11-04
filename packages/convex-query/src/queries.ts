import type {
  InfiniteQueryOptions,
  QueryHandle,
  QueryHandleWithData,
  QueryOptions,
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
import type { ConvexQueryError, ConvexReader } from "./reader.ts";
import { readConvexQuery } from "./reader.ts";

/** First element of every {@link convexQuery} key. */
export const CONVEX_QUERY_KEY = "convexQuery";

/** First element of every {@link convexPaginatedQuery} key. */
export const CONVEX_PAGINATED_QUERY_KEY = "convexPaginatedQuery";

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

/** The raf-query factory {@link convexQuery} returns for `TQuery`. */
export type ConvexQueryFactory<TQuery extends QueryReference> = (
  args: FunctionArgs<TQuery>,
) => QueryOptions<{
  data: FunctionReturnType<TQuery>;
  error: ConvexQueryError;
  services: ConvexReader;
  throwOnError: true;
}>;

/** The raf-query factory {@link convexPaginatedQuery} returns for `TQuery`. */
export type ConvexPaginatedQueryFactory<TQuery extends PaginatedQueryReference> = (
  input: PaginatedQueryInput<TQuery>,
) => InfiniteQueryOptions<{
  error: ConvexQueryError;
  page: FunctionReturnType<TQuery>;
  pageParam: PaginationOptions;
  services: ConvexReader;
  throwOnError: true;
}>;

/**
 * The raf-query factory for a Convex query: its input is the function's args.
 * Data stays live through {@link connectConvexLive}, so it never goes stale.
 * Call it inline; entries are keyed by function name and args, so every call
 * for the same query reaches the same cache entry. It sets `throwOnError`, so
 * reads get the data and failures reach the route's error boundary; pass
 * `throwOnError: false` on a read to get a `Result` instead.

 *
 * @example
 * // loader
 * profile: queryClient.ensure(convexQuery(api.profile.get), {}),
 * // component
 * const [profile] = useQuery(convexQuery(api.profile.get), loaderData.profile);
 */
export function convexQuery<TQuery extends QueryReference>(
  query: TQuery,
): ConvexQueryFactory<TQuery> {
  const functionName = getFunctionName(query);
  return (args) =>
    queryOptions({
      queryFn: () => readConvexQuery(query, args),
      queryKey: [CONVEX_QUERY_KEY, functionName, args],
      retry: false,
      staleTime: Infinity,
      throwOnError: true,
    });
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
 * `fetchNextPage`; every loaded page stays live through {@link connectConvexLive}.
 * Like {@link convexQuery}, call it inline.
 *
 * @example
 * timeline: queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
 *   args: { babyId },
 *   numItems: 20,
 * }),
 */
export function convexPaginatedQuery<TQuery extends PaginatedQueryReference>(
  query: TQuery,
): ConvexPaginatedQueryFactory<TQuery> {
  const functionName = getFunctionName(query);
  return (input) => {
    const initialPageParam: PaginationOptions = { cursor: null, numItems: input.numItems };
    return infiniteQueryOptions({
      getNextPageParam: (lastPage: FunctionReturnType<TQuery>): PaginationOptions | null =>
        lastPage.isDone ? null : { cursor: lastPage.continueCursor, numItems: input.numItems },
      initialPageParam,
      queryFn: (context) => readConvexQuery(query, pageArgs<TQuery>(input.args, context.pageParam)),
      queryKey: [CONVEX_PAGINATED_QUERY_KEY, functionName, input.args, input.numItems],
      retry: false,
      staleTime: Infinity,
      throwOnError: true,
    });
  };
}

/** First element of every {@link convexBidirectionalPaginatedQuery} key. */
export const CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY = "convexBidirectionalPaginatedQuery";

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
> = (input: BidirectionalPaginatedQueryInput<TForward, TBackward>) => InfiniteQueryOptions<{
  error: ConvexQueryError;
  page: FunctionReturnType<TBackward> | FunctionReturnType<TForward>;
  pageParam: BidirectionalPageParam;
  services: ConvexReader;
  throwOnError: true;
}>;

/**
 * An infinite query that grows from a starting point in both directions,
 * over two cursor-paginated Convex queries with the same args: `forward`
 * loads the first page and every `fetchNextPage`, `backward` loads every
 * `fetchPreviousPage`, starting right before the first page and moving away
 * from it. raf-query prepends backward pages, so `pages` reads in feed order
 * as long as each backward page is reversed. Nothing loads backward until
 * `fetchPreviousPage` is called. Every page stays live through
 * {@link connectConvexLive}, pinned like {@link convexPaginatedQuery}'s.
 *
 * @example
 * // A linked item, older items on scroll, newer ones on demand.
 * feed: queryClient.ensure(
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
  return (input) => {
    const initialPageParam: BidirectionalPageParam = {
      cursor: null,
      direction: "forward",
      next: null,
      numItems: input.numItems,
    };
    return infiniteQueryOptions({
      // raf-query passes (lastPage, pages, lastPageParam, pageParams) here and
      // (firstPage, pages, firstPageParam, pageParams) below; the rest
      // parameters keep to `max-params`.
      getNextPageParam: (
        ...params: [
          lastPage: FunctionReturnType<TBackward> | FunctionReturnType<TForward>,
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
          firstPage: FunctionReturnType<TBackward> | FunctionReturnType<TForward>,
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
      queryFn: (context) => {
        const paginationOpts = {
          cursor: context.pageParam.cursor,
          numItems: context.pageParam.numItems,
        };
        return context.pageParam.direction === "forward"
          ? readConvexQuery(queries.forward, pageArgs<TForward>(input.args, paginationOpts))
          : readConvexQuery(queries.backward, pageArgs<TBackward>(input.args, paginationOpts));
      },
      queryKey: [
        CONVEX_BIDIRECTIONAL_PAGINATED_QUERY_KEY,
        forwardName,
        backwardName,
        input.args,
        input.numItems,
      ],
      retry: false,
      staleTime: Infinity,
      throwOnError: true,
    });
  };
}

/** Loader handle from `queryClient.ensure(convexQuery(query), args)`. */
export type EnsuredConvexQuery<TQuery extends QueryReference> = QueryHandleWithData<
  ConvexQueryFactory<TQuery>
>;

/** Handle from `queryClient.prefetch(convexQuery(query), args)` or `useWaterfall`. */
export type ConvexQueryHandle<TQuery extends QueryReference> = QueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Loader handle from `queryClient.ensure(convexPaginatedQuery(query), input)`. */
export type EnsuredConvexPaginatedQuery<TQuery extends PaginatedQueryReference> =
  QueryHandleWithData<ConvexPaginatedQueryFactory<TQuery>>;

/** Handle from `queryClient.prefetch(convexPaginatedQuery(query), input)` or `useWaterfall`. */
export type ConvexPaginatedQueryHandle<TQuery extends PaginatedQueryReference> = QueryHandle<
  ConvexPaginatedQueryFactory<TQuery>
>;

/** Loader handle from `queryClient.ensure(convexBidirectionalPaginatedQuery(queries), input)`. */
export type EnsuredConvexBidirectionalPaginatedQuery<
  TForward extends PaginatedQueryReference,
  TBackward extends PaginatedQueryReference,
> = QueryHandleWithData<ConvexBidirectionalPaginatedQueryFactory<TForward, TBackward>>;
