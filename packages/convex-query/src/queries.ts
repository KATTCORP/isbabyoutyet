import type {
  InfiniteData,
  InfiniteQueryOptions,
  Optional,
  OptionsOf,
  QueryHandle,
  QueryOptions,
  Retry,
  RootOf,
} from "@raf-query/react";
import { bindInfiniteQueryOptions, bindQueryOptions } from "@raf-query/react";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import { getFunctionName } from "convex/server";
import { CONVEX_PAGINATED_QUERY_KEY, CONVEX_QUERY_KEY } from "./entries.ts";
import type { Convex } from "./context.ts";
import { runConvexEffect } from "./context.ts";
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

/**
 * What this package's factories need of a client: the `convex` part, whose
 * reader their `queryFn`s read through. They also set `retry` where the
 * client retries, without needing it to.
 */
type Parts = Convex & Optional<Retry>;

const queryOptions = bindQueryOptions<Parts>();
const infiniteQueryOptions = bindInfiniteQueryOptions<Parts>();

/** Convex data is live (see `convex`), so it never goes stale, and its errors are deterministic. */
const LIVE_OPTIONS = { retry: false, staleTime: Infinity } satisfies OptionsOf<Parts>;

/** A public Convex query. */
export type QueryReference = FunctionReference<"query", "public">;

/** A public Convex query that takes `paginationOpts` and returns a page. */
export type PaginatedQueryReference = FunctionReference<
  "query",
  "public",
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>;

/** Which way a page reads from where a two-way query starts. */
export type PageDirection = "backward" | "forward";

/** The items before a page, in feed order, that aren't loaded: at least `count` when `more`. */
export interface PageBefore {
  readonly count: number;
  readonly more: boolean;
}

/**
 * A paginated query that reads both ways from where it starts. On top of
 * `paginationOpts` it takes `from` (an item's id, or `null` for the top)
 * and `direction`: `"forward"` pages read on from the start, `"backward"`
 * pages read the other way, from right before it. Its items have an `_id`,
 * so the page can tell whether it shows `from`, and each page says what's
 * `before` it that isn't loaded: on the first forward page and on every
 * backward page; `null` on the others, which have pages before them.
 */
export type TwoWayPaginatedQueryReference = FunctionReference<
  "query",
  "public",
  { direction: PageDirection; from: string | null; paginationOpts: PaginationOptions },
  PaginationResult<{ readonly _id: string }> & { readonly before: PageBefore | null }
>;

/** A paginated query's args without the ones each page fetch adds. */
export type PaginationArgs<TQuery extends PaginatedQueryReference> =
  TQuery extends TwoWayPaginatedQueryReference
    ? Omit<FunctionArgs<TQuery>, "direction" | "from" | "paginationOpts">
    : Omit<FunctionArgs<TQuery>, "paginationOpts">;

/**
 * Input of a {@link convexPaginatedQuery} factory. A two-way query's also
 * says where its pages start, `from`, which isn't part of the entry's key.
 */
export type PaginatedQueryInput<TQuery extends PaginatedQueryReference> =
  TQuery extends TwoWayPaginatedQueryReference
    ? {
        readonly args: PaginationArgs<TQuery>;
        /**
         * Where the pages start. Every start shares the entry, which keeps
         * the start it was loaded with while its pages show `from`.
         */
        readonly from: string | null;
        /** Page size, both ways. */
        readonly numItems: number;
      }
    : {
        readonly args: PaginationArgs<TQuery>;
        /** Page size, for the first page and every page after it. */
        readonly numItems: number;
      };

/** Page param of a two-way {@link convexPaginatedQuery}: a cursor one way from the start. */
export interface TwoWayPageParam {
  readonly cursor: string | null;
  readonly direction: PageDirection;
  /** Where the pages start, the same on every page of an entry. */
  readonly from: string | null;
  /**
   * A backward page's param for the page after it in `pages`, so a refetch,
   * which walks forward from the first page, retraces the backward pages
   * towards the start. `null` on forward pages.
   */
  readonly next: TwoWayPageParam | null;
  readonly numItems: number;
}

/** Page param of a {@link convexPaginatedQuery}. */
export type PaginatedPageParam<TQuery extends PaginatedQueryReference> =
  TQuery extends TwoWayPaginatedQueryReference ? TwoWayPageParam : PaginationOptions;

/** The root of this package's factories: they run on the clients that have the `convex` part. */
type ConvexRoot = RootOf<Convex>;

/** The raf-query factory {@link convexQuery} returns for `TQuery`. */
export type ConvexQueryFactory<TQuery extends QueryReference> = (
  args: FunctionArgs<TQuery>,
) => QueryOptions<
  readonly [typeof CONVEX_QUERY_KEY, string, FunctionArgs<TQuery>],
  FunctionReturnType<TQuery>,
  FunctionReturnType<TQuery>,
  ConvexRoot
>;

/**
 * The raf-query factory for a Convex query: its input is the function's args.
 * Data stays live through the `convex` part, so it never goes stale. Call it
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

/** The raf-query factory {@link convexPaginatedQuery} returns for `TQuery`. */
export type ConvexPaginatedQueryFactory<TQuery extends PaginatedQueryReference> = (
  input: PaginatedQueryInput<TQuery>,
) => InfiniteQueryOptions<
  readonly [typeof CONVEX_PAGINATED_QUERY_KEY, string, PaginationArgs<TQuery>, number],
  FunctionReturnType<TQuery>,
  PaginatedPageParam<TQuery>,
  InfiniteData<FunctionReturnType<TQuery>, PaginatedPageParam<TQuery>>,
  ConvexRoot
>;

function pageArgs<TQuery extends PaginatedQueryReference>(
  args: DefaultFunctionArgs,
  paginationOpts: PaginationOptions,
): FunctionArgs<TQuery>;
function pageArgs(args: DefaultFunctionArgs, paginationOpts: PaginationOptions) {
  return { ...args, paginationOpts };
}

function twoWayPageArgs<TQuery extends TwoWayPaginatedQueryReference>(
  args: DefaultFunctionArgs,
  param: TwoWayPageParam,
): FunctionArgs<TQuery>;
function twoWayPageArgs(args: DefaultFunctionArgs, param: TwoWayPageParam) {
  return {
    ...args,
    direction: param.direction,
    from: param.from,
    paginationOpts: { cursor: param.cursor, numItems: param.numItems },
  };
}

/** Pages one way: on from the start, `fetchNextPage` by `fetchNextPage`. */
function oneWayOptions<TQuery extends PaginatedQueryReference>(
  query: TQuery,
  input: { readonly args: DefaultFunctionArgs; readonly numItems: number },
) {
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
    queryKey: [CONVEX_PAGINATED_QUERY_KEY, getFunctionName(query), input.args, input.numItems],
  });
}

/** Whether a two-way page says something is before it. */
function hasBefore(page: { readonly before: PageBefore | null }) {
  return page.before !== null && (page.before.count > 0 || page.before.more);
}

/** Whether `data`, a two-way entry's, starts at `from` or shows the item `from` names. */
function showsStart(
  data: InfiniteData<PaginationResult<{ readonly _id: string }>, TwoWayPageParam>,
  from: string | null,
) {
  if (data.pageParams[0]?.from === from) {
    return true;
  }
  return from !== null && data.pages.some((page) => page.page.some((item) => item._id === from));
}

/**
 * Pages both ways from `from`: forward pages on `fetchNextPage`, backward
 * pages on `fetchPreviousPage`, starting right before the first page and
 * moving away from it. raf-query prepends backward pages, so `pages` reads
 * in order as long as each backward page is reversed.
 */
function twoWayOptions<TQuery extends TwoWayPaginatedQueryReference>(
  query: TQuery,
  input: {
    readonly args: DefaultFunctionArgs;
    readonly from: string | null;
    readonly numItems: number;
  },
) {
  const initialPageParam: TwoWayPageParam = {
    cursor: null,
    direction: "forward",
    from: input.from,
    next: null,
    numItems: input.numItems,
  };
  return infiniteQueryOptions({
    ...LIVE_OPTIONS,
    // raf-query passes (lastPage, pages, lastPageParam) here and
    // (firstPage, pages, firstPageParam) below; the rest parameters keep to
    // `max-params`. Each param carries the entry's `from` on.
    getNextPageParam: (
      ...params: [
        lastPage: FunctionReturnType<TQuery>,
        pages: unknown,
        lastPageParam: TwoWayPageParam,
      ]
    ): TwoWayPageParam | null => {
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
    // There's a page before the first while the first says something is
    // before it: the first forward page counts what's before the start,
    // and each backward page what's still before it.
    getPreviousPageParam: (
      ...params: [
        firstPage: FunctionReturnType<TQuery>,
        pages: unknown,
        firstPageParam: TwoWayPageParam,
      ]
    ): TwoWayPageParam | null => {
      const firstPage = params[0];
      const firstPageParam = params[2];
      if (!hasBefore(firstPage)) {
        return null;
      }
      return {
        cursor: firstPageParam.direction === "forward" ? null : firstPage.continueCursor,
        direction: "backward",
        from: firstPageParam.from,
        next: firstPageParam,
        numItems: input.numItems,
      };
    },
    initialPageParam,
    // Every start shares the entry: `load` keeps its pages while they start
    // at `from` or show it, and starts over at `from` otherwise.
    keepPages: (data) => showsStart(data, input.from),
    queryFn: (context) =>
      runConvexEffect(
        context,
        readConvexQuery(query, twoWayPageArgs<TQuery>(input.args, context.pageParam)),
      ),
    queryKey: [CONVEX_PAGINATED_QUERY_KEY, getFunctionName(query), input.args, input.numItems],
  });
}

// Only an input that says where pages start reaches this, and the factory's
// types give one only for a two-way query.
function asTwoWay(query: PaginatedQueryReference): TwoWayPaginatedQueryReference;
function asTwoWay(query: QueryReference) {
  return query;
}

/**
 * The raf-query factory for a cursor-paginated Convex query. Pages load with
 * `fetchNextPage`; every loaded page stays live through the `convex` part, and
 * every page but the last is pinned to end where the next starts. Like
 * {@link convexQuery}, call it inline.
 *
 * A query that reads both ways ({@link TwoWayPaginatedQueryReference})
 * also loads pages before the first with `fetchPreviousPage`, and its input
 * says where the pages start, `from`. `hasPreviousPage` follows what the
 * first page says is before it. `from` rides in the page params, not the
 * key, so every start shares one entry: `load` keeps its pages while they
 * start at `from` or show it, so moving between items the page shows, or
 * back and forward, reads nothing, and starts over at any other `from`.
 *
 * @example
 * // One way: the latest first.
 * timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), { args: { babyId }, numItems: 20 }),
 * // Both ways, from `?item=`: older items on scroll, newer ones on demand.
 * timeline: swr(convexPaginatedQuery(api.timeline.listFeed), {
 *   args: { babyId, context: 2 },
 *   from: deps.item,
 *   numItems: 20,
 * }),
 */
export function convexPaginatedQuery<TQuery extends PaginatedQueryReference>(
  query: TQuery,
): ConvexPaginatedQueryFactory<TQuery>;
export function convexPaginatedQuery(query: PaginatedQueryReference): object {
  return memoized(
    JSON.stringify([CONVEX_PAGINATED_QUERY_KEY, getFunctionName(query)]),
    () =>
      (input: {
        readonly args: DefaultFunctionArgs;
        readonly from: string | null | undefined;
        readonly numItems: number;
      }) =>
        input.from === undefined
          ? oneWayOptions(query, input)
          : twoWayOptions(asTwoWay(query), { ...input, from: input.from }),
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
