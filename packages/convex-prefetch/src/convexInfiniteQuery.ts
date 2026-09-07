import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import {
  infiniteQueryOptions,
  type InfiniteData,
  type QueryFunctionContext,
  type QueryKey,
} from "@tanstack/react-query";
import {
  type DefaultFunctionArgs,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";

/**
 * Query-key prefix for Convex paginated queries consumed via TanStack
 * `useSuspenseInfiniteQuery`. Distinct from `convexQuery` because each page
 * fetch carries `paginationOpts` in `pageParam`, not in the key.
 */
export const CONVEX_INFINITE_QUERY_KEY = "convexInfiniteQuery";

/** Convex queries that accept `paginationOpts` and return a pagination result. */
export type PaginatedQueryReference = FunctionReference<
  "query",
  "public",
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>;

/** A paginated query's args minus the `paginationOpts` the page fetch injects. */
export type PaginationArgs<TFunc extends PaginatedQueryReference> = Omit<
  FunctionArgs<TFunc>,
  "paginationOpts"
>;

type ConvexInfiniteQueryKey<TQuery extends PaginatedQueryReference = PaginatedQueryReference> =
  readonly [typeof CONVEX_INFINITE_QUERY_KEY, TQuery, PaginationArgs<TQuery>];

type RuntimeConvexInfiniteQueryKey = readonly [
  typeof CONVEX_INFINITE_QUERY_KEY,
  FunctionReference<"query">,
  DefaultFunctionArgs,
];

type ResolvedPaginatedQuery<TQuery extends PaginatedQueryReference> = [TQuery] extends [never]
  ? PaginatedQueryReference
  : TQuery;

function isConvexInfiniteQueryKey(
  queryKey: ReadonlyArray<unknown>,
): queryKey is RuntimeConvexInfiniteQueryKey {
  return queryKey.length >= 2 && queryKey[0] === CONVEX_INFINITE_QUERY_KEY;
}

function paginatedArgs<TQuery extends PaginatedQueryReference>(
  args: PaginationArgs<TQuery>,
  paginationOpts: PaginationOptions,
): FunctionArgs<TQuery>;
function paginatedArgs(args: DefaultFunctionArgs, paginationOpts: PaginationOptions) {
  return { ...args, paginationOpts };
}

function serializableQueryReference<TQuery extends PaginatedQueryReference>(
  funcRef: TQuery,
  args: FunctionArgs<TQuery>,
): TQuery;
function serializableQueryReference(
  funcRef: PaginatedQueryReference,
  args: FunctionArgs<PaginatedQueryReference>,
) {
  return convexQuery(funcRef, args).queryKey[1];
}

async function fetchConvexInfinitePage<TQuery extends PaginatedQueryReference>(
  convexQueryClient: ConvexQueryClient,
  opts: {
    pageParam: PaginationOptions;
    queryKey: ConvexInfiniteQueryKey<TQuery>;
  },
): Promise<FunctionReturnType<TQuery>>;
async function fetchConvexInfinitePage(
  convexQueryClient: ConvexQueryClient,
  opts: {
    pageParam: unknown;
    queryKey: RuntimeConvexInfiniteQueryKey;
  },
): Promise<FunctionReturnType<PaginatedQueryReference>>;
async function fetchConvexInfinitePage(
  convexQueryClient: ConvexQueryClient,
  opts: {
    pageParam: unknown;
    queryKey: RuntimeConvexInfiniteQueryKey;
  },
) {
  const func = opts.queryKey[1];
  const args = opts.queryKey[2];
  const queryArgs = { ...args, paginationOpts: opts.pageParam };

  if (globalThis.window === undefined) {
    const http = convexQueryClient.serverHttpClient;
    if (!http) {
      throw new Error("Convex SSR HTTP client is not available");
    }
    return await http.consistentQuery(func, queryArgs);
  }

  return await convexQueryClient.convexClient.query(func, queryArgs);
}

/**
 * Default `queryFn` that understands both regular `convexQuery` keys and
 * {@link convexInfiniteQuery} keys (merging `pageParam` into `paginationOpts`).
 *
 * Install it on each `QueryClient` (`defaultOptions.queries.queryFn`). The
 * Convex client is captured per QueryClient — never in module state — so
 * concurrent SSR requests, each with its own authenticated
 * `serverHttpClient`, cannot fetch pages through one another's client.
 */
export function convexInfiniteQueryFn(convexQueryClient: ConvexQueryClient) {
  const fallback = convexQueryClient.queryFn();
  return async (context: QueryFunctionContext<QueryKey>) => {
    if (!isConvexInfiniteQueryKey(context.queryKey)) {
      return fallback(context);
    }
    if (!context.pageParam) {
      throw new Error("Convex infinite query requires an initialPageParam");
    }
    return fetchConvexInfinitePage(convexQueryClient, {
      pageParam: context.pageParam,
      queryKey: context.queryKey,
    });
  };
}

/**
 * Infinite-query options factory for Convex paginated queries.
 *
 * Like `convexQuery`, this sets no `queryFn`: pages are fetched by the
 * QueryClient's default `queryFn`, which must be {@link convexInfiniteQueryFn}
 * bound to that QueryClient's own ConvexQueryClient.
 */
export function convexInfiniteQuery<TQuery extends PaginatedQueryReference>(
  funcRef: TQuery,
  opts: {
    args: PaginationArgs<ResolvedPaginatedQuery<TQuery>>;
    initialNumItems: number;
  },
) {
  type Query = ResolvedPaginatedQuery<TQuery>;
  type Page = FunctionReturnType<Query>;
  const initialPageParam: PaginationOptions = {
    cursor: null,
    numItems: opts.initialNumItems,
  };
  const initialArgs = paginatedArgs<Query>(opts.args, initialPageParam);
  const serializableFuncRef = serializableQueryReference<Query>(funcRef, initialArgs);
  const queryKey: ConvexInfiniteQueryKey<Query> = [
    CONVEX_INFINITE_QUERY_KEY,
    serializableFuncRef,
    opts.args,
  ];

  return infiniteQueryOptions<
    Page,
    Error,
    InfiniteData<Page, PaginationOptions>,
    ConvexInfiniteQueryKey<Query>,
    PaginationOptions
  >({
    getNextPageParam: (...params: [Page, Array<Page>, PaginationOptions]) => {
      const lastPage = params[0];
      const lastPageParam = params[2];
      if (lastPage.isDone) {
        return undefined;
      }
      return {
        cursor: lastPage.continueCursor,
        numItems: lastPageParam.numItems,
      };
    },
    initialPageParam,
    queryKey,
    staleTime: Infinity,
  });
}
