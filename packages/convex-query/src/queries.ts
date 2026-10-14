import type {
  EnsuredQueryHandle,
  InfiniteQueryOptions,
  QueryHandle,
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
}>;

/** The raf-query factory {@link convexPaginatedQuery} returns for `TQuery`. */
export type ConvexPaginatedQueryFactory<TQuery extends PaginatedQueryReference> = (
  input: PaginatedQueryInput<TQuery>,
) => InfiniteQueryOptions<{
  error: ConvexQueryError;
  page: FunctionReturnType<TQuery>;
  pageParam: PaginationOptions;
  services: ConvexReader;
}>;

/**
 * The raf-query factory for a Convex query: its input is the function's args.
 * Data stays live through {@link connectConvexLive}, so it never goes stale.
 * Call it inline; entries are keyed by function name and args, so every call
 * for the same query reaches the same cache entry.
 *
 * The return type is `NoInfer` so a call passed straight to a raf verb
 * (`queryClient.ensure(convexQuery(api.x), args)`) infers `TQuery` from
 * `query` alone, not from the verb's `QueryFactory` constraint.
 *
 * @example
 * // loader
 * profile: queryClient.ensure(convexQuery(api.profile.get), {}),
 * // component
 * const [profile] = useQuery(convexQuery(api.profile.get), loaderData.profile);
 */
export function convexQuery<TQuery extends QueryReference>(
  query: TQuery,
): NoInfer<ConvexQueryFactory<TQuery>> {
  const functionName = getFunctionName(query);
  return (args) =>
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
): NoInfer<ConvexPaginatedQueryFactory<TQuery>> {
  const functionName = getFunctionName(query);
  return (input) =>
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

/** Loader handle from `queryClient.ensure(convexQuery(query), args)`. */
export type EnsuredConvexQuery<TQuery extends QueryReference> = EnsuredQueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Handle from `queryClient.prefetch(convexQuery(query), args)` or `useWaterfall`. */
export type ConvexQueryHandle<TQuery extends QueryReference> = QueryHandle<
  ConvexQueryFactory<TQuery>
>;

/** Loader handle from `queryClient.ensure(convexPaginatedQuery(query), input)`. */
export type EnsuredConvexPaginatedQuery<TQuery extends PaginatedQueryReference> =
  EnsuredQueryHandle<ConvexPaginatedQueryFactory<TQuery>>;

/** Handle from `queryClient.prefetch(convexPaginatedQuery(query), input)` or `useWaterfall`. */
export type ConvexPaginatedQueryHandle<TQuery extends PaginatedQueryReference> = QueryHandle<
  ConvexPaginatedQueryFactory<TQuery>
>;
