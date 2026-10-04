import type { QueryClient } from "@tanstack/react-query";
import { isFunction } from "@workspace/runtime/guards";
import type {
  AnyQueryOptions,
  InitiatedInfiniteQuery,
  InitiatedQuery,
  PreloadedInfiniteQuery,
  PreloadedQuery,
  QueryDataOf,
  QueryFactoryInput,
  QueryInput,
  QueryInputArgs,
  QueryOptionsFactory,
} from "./types.js";

/** Page cursor/offset at the untyped infinite-query options boundary. */
type InfiniteQueryPageParam = string | number | boolean | null | object;

/** Rejection value forwarded to initiator `onError` before domain handling. */
type QueryFailureReason =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Array<QueryFailureReason>
  | { readonly [key: string]: QueryFailureReason };

interface AnyInfiniteQueryOptions extends AnyQueryOptions {
  getNextPageParam(
    ...args: [
      lastPage: unknown,
      allPages: Array<unknown>,
      lastPageParam: InfiniteQueryPageParam,
      allPageParams: Array<InfiniteQueryPageParam>,
    ]
  ): InfiniteQueryPageParam | null | undefined;
  initialPageParam: InfiniteQueryPageParam;
}

type RuntimeQueryOptionsFactory = {
  bivarianceHack(input: QueryFactoryInput): AnyQueryOptions;
}["bivarianceHack"];

interface OnErrorFnOptions {
  error: unknown;
}

type OnError = (options: OnErrorFnOptions) => void;

function noop(): void {}

function invokeFactory<TFactory extends QueryOptionsFactory>(
  factory: TFactory,
  input: QueryInput<TFactory> | undefined,
): ReturnType<TFactory>;
function invokeFactory(
  factory: RuntimeQueryOptionsFactory,
  // oxlint-disable-next-line typescript/no-explicit-any -- overload implementation
  input: any,
) {
  return factory(input);
}

type RuntimeInitiatedQuery = {
  input?: unknown;
};

type RuntimePreloadedQuery = {
  initialData: unknown;
  input?: unknown;
};

function createInitiatedQuery<TFactory extends QueryOptionsFactory>(
  factory: TFactory,
  input: QueryInputArgs<TFactory>,
): InitiatedQuery<TFactory>;
function createInitiatedQuery(
  _factory: RuntimeQueryOptionsFactory,
  input: ReadonlyArray<unknown>,
): RuntimeInitiatedQuery {
  return { input: input[0] };
}

function createInitiatedInfiniteQuery<TFactory extends QueryOptionsFactory>(
  factory: TFactory,
  input: QueryInputArgs<TFactory>,
): InitiatedInfiniteQuery<TFactory>;
function createInitiatedInfiniteQuery(
  _factory: RuntimeQueryOptionsFactory,
  input: ReadonlyArray<unknown>,
): RuntimeInitiatedQuery {
  return { input: input[0] };
}

function createPreloadedQuery<TFactory extends QueryOptionsFactory>(
  factory: TFactory,
  handle: {
    initialData: QueryDataOf<ReturnType<TFactory>>;
    input: QueryInputArgs<TFactory>;
  },
): PreloadedQuery<TFactory>;
function createPreloadedQuery(
  _factory: RuntimeQueryOptionsFactory,
  handle: { initialData: unknown; input: ReadonlyArray<unknown> },
): RuntimePreloadedQuery {
  return { initialData: handle.initialData, input: handle.input[0] };
}

function createPreloadedInfiniteQuery<TFactory extends QueryOptionsFactory>(
  factory: TFactory,
  handle: {
    initialData: QueryDataOf<ReturnType<TFactory>>;
    input: QueryInputArgs<TFactory>;
  },
): PreloadedInfiniteQuery<TFactory>;
function createPreloadedInfiniteQuery(
  _factory: RuntimeQueryOptionsFactory,
  handle: { initialData: unknown; input: ReadonlyArray<unknown> },
): RuntimePreloadedQuery {
  return { initialData: handle.initialData, input: handle.input[0] };
}

function ensureFactoryQueryData<TFactory extends QueryOptionsFactory>(
  queryClient: QueryClient,
  options: ReturnType<TFactory>,
): Promise<QueryDataOf<ReturnType<TFactory>>>;
function ensureFactoryQueryData(queryClient: QueryClient, options: AnyQueryOptions) {
  // Handles carry raw query data as `initialData`, so a factory's `select` must not run here.
  return queryClient.query({ ...options, select: undefined, staleTime: "static" });
}

function isInfiniteQueryOptions(options: AnyQueryOptions): options is AnyInfiniteQueryOptions {
  return (
    "initialPageParam" in options &&
    "getNextPageParam" in options &&
    isFunction(options.getNextPageParam)
  );
}

function ensureFactoryInfiniteQueryData<TFactory extends QueryOptionsFactory>(
  queryClient: QueryClient,
  options: ReturnType<TFactory>,
): Promise<QueryDataOf<ReturnType<TFactory>>>;
function ensureFactoryInfiniteQueryData(queryClient: QueryClient, options: AnyQueryOptions) {
  if (!isInfiniteQueryOptions(options)) {
    throw new TypeError("Infinite query options require page parameters");
  }
  return queryClient.infiniteQuery({ ...options, select: undefined, staleTime: "static" });
}

/**
 * Starts loader queries without blocking navigation. Returned initiated handles
 * only store the input, so loader data stays serializable.
 *
 * Use {@link getQueryPreloader} instead when later params depend on loaded data.
 *
 * @example
 * const queryInitiator = getQueryInitiator(queryClient, { onError });
 * return {
 *   post: queryInitiator.ensureQueryData(postById, { postId }),
 * };
 *
 * function PostRoute() {
 *   const loaderData = useLoaderData<typeof clientLoader>();
 *   const postQuery = useSuspenseQuery(
 *     preloadedQueryOptions(postById, loaderData.post),
 *   );
 *   return <Post post={postQuery.data} />;
 * }
 */
export function getQueryInitiator(
  queryClient: QueryClient,
  initiatorOptions: { onError?: OnError } = {},
) {
  const onError = initiatorOptions.onError ?? noop;

  return {
    /**
     * Starts a cached `queryClient.query(...)` in the background and returns an
     * {@link InitiatedQuery} handle for route data.
     *
     * @example
     * const post = queryInitiator.ensureQueryData(postById, { postId });
     *
     * function PostRoute() {
     *   const postQuery = useSuspenseQuery(
     *     preloadedQueryOptions(postById, post),
     *   );
     *   return <Post post={postQuery.data} />;
     * }
     */
    ensureQueryData<TFactory extends QueryOptionsFactory>(
      factory: TFactory,
      ...input: QueryInputArgs<TFactory>
    ): InitiatedQuery<TFactory> {
      const options = invokeFactory(factory, input[0]);
      ensureFactoryQueryData<TFactory>(queryClient, options).catch((error: QueryFailureReason) =>
        onError({ error }),
      );
      return createInitiatedQuery(factory, input);
    },

    /**
     * Starts a cached `queryClient.infiniteQuery(...)` in the background and
     * returns an {@link InitiatedInfiniteQuery} handle.
     *
     * @example
     * const posts = queryInitiator.ensureInfiniteQueryData(postsInfinite, params);
     *
     * function PostsRoute() {
     *   const postsQuery = useSuspenseInfiniteQuery(
     *     preloadedInfiniteQueryOptions(postsInfinite, posts),
     *   );
     *   return <Posts pages={postsQuery.data.pages} />;
     * }
     */
    ensureInfiniteQueryData<TFactory extends QueryOptionsFactory>(
      factory: TFactory,
      ...input: QueryInputArgs<TFactory>
    ): InitiatedInfiniteQuery<TFactory> {
      const options = invokeFactory(factory, input[0]);
      ensureFactoryInfiniteQueryData<TFactory>(queryClient, options).catch(
        (error: QueryFailureReason) => onError({ error }),
      );
      return createInitiatedInfiniteQuery(factory, input);
    },
  };
}

/**
 * Awaits loader queries and returns handles with `initialData`.
 *
 * Use {@link getQueryInitiator} for fire-and-forget cache warming.
 *
 * @example
 * const queryPreloader = getQueryPreloader(queryClient);
 * const post = await queryPreloader.ensureQueryData(postById, { postId });
 * const authorId = post.initialData.authorId;
 *
 * function PostRoute() {
 *   const loaderData = useLoaderData<typeof clientLoader>();
 *   const postQuery = useQuery(
 *     preloadedQueryOptions(postById, loaderData.post),
 *   );
 *   return <Post post={postQuery.data} />;
 * }
 */
export function getQueryPreloader(queryClient: QueryClient) {
  return {
    /**
     * Awaits a cached `queryClient.query(...)` and returns a
     * {@link PreloadedQuery} handle with `initialData`.
     *
     * @example
     * const post = await queryPreloader.ensureQueryData(postById, { postId });
     *
     * function PostRoute() {
     *   const postQuery = useQuery(
     *     preloadedQueryOptions(postById, post),
     *   );
     *   return <Post post={postQuery.data} />;
     * }
     */
    async ensureQueryData<TFactory extends QueryOptionsFactory>(
      factory: TFactory,
      ...input: QueryInputArgs<TFactory>
    ): Promise<PreloadedQuery<TFactory>> {
      const options = invokeFactory(factory, input[0]);
      const initialData = await ensureFactoryQueryData<TFactory>(queryClient, options);
      return createPreloadedQuery(factory, {
        initialData,
        input,
      });
    },

    /**
     * Awaits a cached `queryClient.infiniteQuery(...)` and returns a
     * {@link PreloadedInfiniteQuery} handle with `initialData`.
     *
     * @example
     * const posts = await queryPreloader.ensureInfiniteQueryData(postsInfinite, params);
     *
     * function PostsRoute() {
     *   const postsQuery = useQuery(
     *     preloadedInfiniteQueryOptions(postsInfinite, posts),
     *   );
     *   return <Posts pages={postsQuery.data.pages} />;
     * }
     */
    async ensureInfiniteQueryData<TFactory extends QueryOptionsFactory>(
      factory: TFactory,
      ...input: QueryInputArgs<TFactory>
    ): Promise<PreloadedInfiniteQuery<TFactory>> {
      const options = invokeFactory(factory, input[0]);
      const initialData = await ensureFactoryInfiniteQueryData<TFactory>(queryClient, options);
      return createPreloadedInfiniteQuery(factory, {
        initialData,
        input,
      });
    },
  };
}
