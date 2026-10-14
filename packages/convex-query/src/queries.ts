import type { EnsuredQueryHandle, QueryHandle } from "@raf-query/react";
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

/**
 * The raf-query factory for a Convex query: its input is the function's args.
 * Data stays live through {@link connectConvexLive}, so it never goes stale.
 *
 * Build it once at module level: raf-query can't infer the input of a
 * generic call passed in place.
 *
 * @example
 * const getProfile = convexQuery(api.profile.get);
 * // loader
 * profile: queryClient.ensure(getProfile, {}),
 * // component
 * const [profile] = useQuery(getProfile, loaderData.profile);
 */
export function convexQuery<TQuery extends QueryReference>(query: TQuery) {
  const functionName = getFunctionName(query);
  return (args: FunctionArgs<TQuery>) =>
    queryOptions<FunctionReturnType<TQuery>, ConvexQueryError, ConvexReader>({
      queryFn: () => readConvexQuery(query, args),
      queryKey: [CONVEX_QUERY_KEY, functionName, args],
      retry: false,
      staleTime: Infinity,
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
 *
 * @example
 * timeline: queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
 *   args: { babyId },
 *   numItems: 20,
 * }),
 */
export function convexPaginatedQuery<TQuery extends PaginatedQueryReference>(query: TQuery) {
  const functionName = getFunctionName(query);
  return (input: PaginatedQueryInput<TQuery>) =>
    infiniteQueryOptions<
      FunctionReturnType<TQuery>,
      PaginationOptions,
      ConvexQueryError,
      ConvexReader
    >({
      getNextPageParam: (lastPage) =>
        lastPage.isDone ? null : { cursor: lastPage.continueCursor, numItems: input.numItems },
      initialPageParam: { cursor: null, numItems: input.numItems },
      queryFn: (context) => readConvexQuery(query, pageArgs<TQuery>(input.args, context.pageParam)),
      queryKey: [CONVEX_PAGINATED_QUERY_KEY, functionName, input.args, input.numItems],
      retry: false,
      staleTime: Infinity,
    });
}

/** The factory {@link convexQuery} returns for `TQuery`. */
export type ConvexQueryFactory<TQuery extends QueryReference> = ReturnType<
  typeof convexQuery<TQuery>
>;

/** The factory {@link convexPaginatedQuery} returns for `TQuery`. */
export type ConvexPaginatedQueryFactory<TQuery extends PaginatedQueryReference> = ReturnType<
  typeof convexPaginatedQuery<TQuery>
>;

/** Loader handle from `queryClient.ensure(convexQuery(query), args)`. */
export type EnsuredConvexQuery<TQuery extends QueryReference> = EnsuredQueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Loader handle from `queryClient.prefetch(convexQuery(query), args)` or `useWaterfall`. */
export type ConvexQueryHandle<TQuery extends QueryReference> = QueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Loader handle from `queryClient.ensure(convexPaginatedQuery(query), input)`. */
export type EnsuredConvexPaginatedQuery<TQuery extends PaginatedQueryReference> =
  EnsuredQueryHandle<ConvexPaginatedQueryFactory<TQuery>>;
