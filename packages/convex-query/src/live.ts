import type { InputOf } from "@raf-query/react";
import { getData, invalidateOne, load, prefetch, setData } from "@raf-query/react";
import type {
  DefaultFunctionArgs,
  FunctionArgs,
  FunctionReturnType,
  PaginationOptions,
} from "convex/server";
import { getFunctionName, makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import type { CacheEntry, LiveKey, LoadedPage, PageStart } from "./entries.ts";
import { liveKey, loadedPages, pageIndex } from "./entries.ts";
import type { ConvexQueryClient } from "./context.ts";
import type { PageDirection, QueryReference } from "./queries.ts";
import { convexPaginatedQuery, convexQuery } from "./queries.ts";
import type { ConvexWatchClient } from "./reader.ts";

/** One Convex subscription feeding part of an entry. */
interface Subscription {
  readonly args: DefaultFunctionArgs;
  /** Stable while the subscription's args are; a new id replaces the subscription. */
  readonly id: string;
  readonly name: string;
  onError(): void;
  onResult(value: Value): void;
}

function querySubscription(
  key: Extract<LiveKey, { kind: "query" }>,
  queryClient: ConvexQueryClient,
): Subscription {
  const factory = convexQuery(makeFunctionReference<"query">(key.name));
  return {
    args: key.args,
    id: "query",
    name: key.name,
    onError: () => void invalidateOne(queryClient, factory, key.args),
    onResult: (value) => {
      setData(queryClient, factory, key.args, value);
    },
  };
}

/** A run of pages that continue one another through one Convex query. */
interface PageChain {
  readonly direction: PageDirection | null;
  readonly name: string;
  readonly pages: ReadonlyArray<Omit<LoadedPage, "direction">>;
}

/** Reads and writes the paged entry a chain's subscriptions feed. */
interface PagedEntry {
  invalidate(): void;
  /** Replaces the loaded page that starts at `start`, if it is still loaded. */
  writePage(start: PageStart, page: Value): void;
}

/**
 * One subscription per page of a chain. Every page but the last is pinned to
 * end where the next page starts (`endCursor`), so items added or removed
 * inside a page grow or shrink that page instead of shifting items across
 * page boundaries — the gaps and duplicates of re-running each page's
 * original `numItems` window. The last page stays open-ended at the size it
 * was loaded with.
 */
function chainSubscriptions(
  chain: PageChain,
  opts: { args: DefaultFunctionArgs; entry: PagedEntry },
): ReadonlyArray<Subscription> {
  return chain.pages.map((loaded, index) => {
    const cursor = loaded.cursor;
    const endCursor = chain.pages[index + 1]?.cursor;
    const paginationOpts: PaginationOptions =
      endCursor === undefined
        ? { cursor, numItems: loaded.numItems }
        : { cursor, endCursor, numItems: loaded.numItems };
    // A two-way query's pages read their direction, from where it starts.
    const twoWay =
      loaded.from === undefined ? {} : { direction: chain.direction, from: loaded.from };
    return {
      args: { ...opts.args, ...twoWay, paginationOpts },
      id: JSON.stringify([chain.direction, cursor, endCursor ?? null]),
      name: chain.name,
      onError: opts.entry.invalidate,
      onResult: (page) => {
        opts.entry.writePage({ cursor, direction: chain.direction }, page);
      },
    };
  });
}

function pagedSubscriptions(
  key: Extract<LiveKey, { kind: "paginated" }>,
  opts: { pages: ReadonlyArray<LoadedPage>; queryClient: ConvexQueryClient },
): ReadonlyArray<Subscription> {
  const queryClient = opts.queryClient;
  const from = opts.pages[0]?.from;
  if (from === undefined) {
    const factory = convexPaginatedQuery(
      makeFunctionReference<"query", { paginationOpts: PaginationOptions }>(key.name),
    );
    const input: InputOf<typeof factory> = { args: key.args, numItems: key.numItems };
    const entry: PagedEntry = {
      invalidate: () => void invalidateOne(queryClient, factory, input),
      writePage: (start, page) => {
        const data = getData(queryClient, factory, input);
        const index = pageIndex(loadedPages(data), start);
        if (data && index !== -1) {
          setData(queryClient, factory, input, {
            pageParams: data.pageParams,
            pages: data.pages.with(index, page),
          });
        }
      },
    };
    const chain: PageChain = { direction: null, name: key.name, pages: opts.pages };
    return chainSubscriptions(chain, { args: key.args, entry });
  }
  // A two-way entry, read with the start its pages carry: writes go through
  // `setData`, which gives the entry this input's options, and the start
  // isn't part of the key.
  const factory = convexPaginatedQuery(
    makeFunctionReference<
      "query",
      { direction: PageDirection; from: string | null; paginationOpts: PaginationOptions }
    >(key.name),
  );
  const input: InputOf<typeof factory> = { args: key.args, from, numItems: key.numItems };
  const entry: PagedEntry = {
    invalidate: () => void invalidateOne(queryClient, factory, input),
    writePage: (start, page) => {
      const data = getData(queryClient, factory, input);
      const index = pageIndex(loadedPages(data), start);
      if (data && index !== -1) {
        setData(queryClient, factory, input, {
          pageParams: data.pageParams,
          pages: data.pages.with(index, page),
        });
      }
    },
  };
  const pagesOf = (direction: PageDirection) =>
    opts.pages.filter((loaded) => loaded.direction === direction);
  // Backward pages are prepended, so their chain runs from the end of the
  // list towards its start.
  const chains: ReadonlyArray<PageChain> = [
    { direction: "forward", name: key.name, pages: pagesOf("forward") },
    { direction: "backward", name: key.name, pages: pagesOf("backward").toReversed() },
  ];
  return chains.flatMap((chain) => chainSubscriptions(chain, { args: key.args, entry }));
}

function subscriptionsFor(
  entry: CacheEntry,
  queryClient: ConvexQueryClient,
): ReadonlyArray<Subscription> {
  const key = liveKey(entry.key);
  const state = entry.state;
  if (!key || !state.hasData) {
    return [];
  }
  if (key.kind === "query") {
    return [querySubscription(key, queryClient)];
  }
  const pages = loadedPages(state.data);
  return pages ? pagedSubscriptions(key, { pages, queryClient }) : [];
}

/** A live subscription to Convex. */
interface Watch {
  unsubscribe(): void;
}

/** A live subscription, or `null` while it is being claimed. */
type Watching = Watch | null;

function subscribe(subscription: Subscription, client: ConvexWatchClient): Watch {
  const watch = client.watchQuery(
    makeFunctionReference<"query">(subscription.name),
    subscription.args,
  );
  const update = () => {
    let value;
    try {
      value = watch.localQueryResult();
    } catch {
      subscription.onError();
      return;
    }
    if (value !== undefined) {
      subscription.onResult(value);
    }
  };
  const unsubscribe = watch.onUpdate(update);
  // A result the client already holds (the read that filled the entry keeps
  // its subscription briefly) won't trigger `onUpdate` again.
  update();
  return { unsubscribe };
}

/**
 * The feature of the `convex` plugin: it keeps every Convex entry of its
 * client live. While an entry is cached and has data, it is subscribed with
 * `watchQuery` and every result is written into the cache. Entries leave
 * Convex when they leave the cache (`gcTime` after their last reader), so
 * navigating back shows current data without a refetch. Like every feature,
 * it runs while a `QueryClientProvider` has the client mounted, so never on
 * the server.
 */
export function liveSync(client: ConvexWatchClient) {
  return (queryClient: ConvexQueryClient, signal: AbortSignal) => {
    /** Entry hash → subscription id → its watch. */
    const live = new Map<string, Map<string, Watching>>();

    const stop = (hash: string) => {
      const subscriptions = live.get(hash);
      live.delete(hash);
      for (const watching of subscriptions?.values() ?? []) {
        watching?.unsubscribe();
      }
    };

    const sync = (entry: CacheEntry) => {
      const wanted = new Map(
        subscriptionsFor(entry, queryClient).map((subscription) => [subscription.id, subscription]),
      );
      if (wanted.size === 0) {
        stop(entry.hash);
        return;
      }
      const current = live.get(entry.hash) ?? new Map<string, Watching>();
      live.set(entry.hash, current);
      for (const [id, watching] of current) {
        if (!wanted.has(id)) {
          current.delete(id);
          watching?.unsubscribe();
        }
      }
      for (const [id, subscription] of wanted) {
        if (!current.has(id)) {
          // Claimed before subscribing: a result the client already holds is
          // written synchronously, and that cache update re-enters `sync`.
          current.set(id, null);
          current.set(id, subscribe(subscription, client));
        }
      }
    };

    queryClient.subscribe(
      (event) => {
        if (event.type === "removed") {
          stop(event.entry.hash);
          return;
        }
        sync(event.entry);
      },
      // Replay: entries hydration or loaders cached before the feature started.
      { replay: true, signal },
    );
    signal.addEventListener("abort", () => {
      for (const hash of live.keys()) {
        stop(hash);
      }
    });
  };
}

/**
 * Watch a {@link convexQuery} entry's values: `onValue` gets the cached
 * value first, if there is one, then every new value the entry takes, until
 * the returned function is called.
 *
 * The entry is read through the cache, so it shares one request with any
 * loader's `load` of the same query and args. While it runs it also holds
 * its own Convex subscription and writes every result into the entry, so it
 * doesn't depend on the live sync or another reader to see the server's
 * next answer. A failing subscription invalidates the entry, as the live
 * sync does, and the watch keeps waiting.
 *
 * @example
 * // resolve with the first profile that has a user
 * const signedIn = Promise.withResolvers<Profile>();
 * const stop = watchConvexQuery(
 *   { client, queryClient },
 *   {
 *     args: {},
 *     onValue: (me) => {
 *       if (me !== null) {
 *         signedIn.resolve(me);
 *       }
 *     },
 *     query: api.profile.get,
 *   },
 * );
 */
export function watchConvexQuery<TQuery extends QueryReference>(
  opts: { client: ConvexWatchClient; queryClient: ConvexQueryClient },
  watch: {
    args: FunctionArgs<TQuery>;
    onValue: (value: FunctionReturnType<TQuery>) => void;
    query: TQuery;
  },
): () => void {
  const factory = convexQuery(watch.query);
  let last: FunctionReturnType<TQuery> | undefined;
  const emit = () => {
    const value = getData(opts.queryClient, factory, watch.args);
    if (value !== undefined && value !== last) {
      last = value;
      watch.onValue(value);
    }
  };
  const unsubscribe = opts.queryClient.subscribe(emit);
  emit();
  void load(opts.queryClient, { watched: prefetch(factory, watch.args) });
  const watching = subscribe(
    querySubscription(
      { args: watch.args, kind: "query", name: getFunctionName(watch.query) },
      opts.queryClient,
    ),
    opts.client,
  );
  return () => {
    unsubscribe();
    watching.unsubscribe();
  };
}
