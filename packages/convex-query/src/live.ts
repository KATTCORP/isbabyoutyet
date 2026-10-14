import type { QueryClient } from "@raf-query/react";
import { Query } from "@raf-query/react";
import type { DefaultFunctionArgs, PaginationOptions } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { Predicate } from "effect";
import {
  CONVEX_PAGINATED_QUERY_KEY,
  CONVEX_QUERY_KEY,
  convexPaginatedQuery,
  convexQuery,
} from "./queries.ts";
import type { ConvexReader, ConvexWatchClient } from "./reader.ts";

function noop() {}

/** A cache entry this module keeps live, decoded from its key. */
type LiveKey =
  | { readonly args: DefaultFunctionArgs; readonly kind: "query"; readonly name: string }
  | {
      readonly args: DefaultFunctionArgs;
      readonly kind: "paginated";
      readonly name: string;
      readonly numItems: number;
    };

/** One Convex subscription feeding part of an entry. */
interface Subscription {
  readonly args: DefaultFunctionArgs;
  /** Stable while the subscription's args are; a new id replaces the subscription. */
  readonly id: string;
  readonly name: string;
  onError(): void;
  onResult(value: Value): void;
}

function liveKey(key: ReadonlyArray<unknown>): LiveKey | null {
  const tag = key[0];
  const name = key[1];
  const args = key[2];
  if (!Predicate.isString(name) || !Predicate.isObject(args)) {
    return null;
  }
  if (tag === CONVEX_QUERY_KEY && key.length === 3) {
    return { args, kind: "query", name };
  }
  const numItems = key[3];
  if (tag === CONVEX_PAGINATED_QUERY_KEY && key.length === 4 && Predicate.isNumber(numItems)) {
    return { args, kind: "paginated", name, numItems };
  }
  return null;
}

function pageCursors(data: Query.State<unknown>["data"]): ReadonlyArray<string | null> | null {
  if (!Predicate.hasProperty(data, "pageParams") || !Array.isArray(data.pageParams)) {
    return null;
  }
  const cursors: Array<string | null> = [];
  for (const param of data.pageParams) {
    if (!Predicate.hasProperty(param, "cursor")) {
      return null;
    }
    const cursor = param.cursor;
    if (cursor !== null && !Predicate.isString(cursor)) {
      return null;
    }
    cursors.push(cursor);
  }
  return cursors;
}

function querySubscriptions(
  key: Extract<LiveKey, { kind: "query" }>,
  queryClient: QueryClient<ConvexReader>,
): ReadonlyArray<Subscription> {
  const factory = convexQuery(makeFunctionReference<"query">(key.name));
  return [
    {
      args: key.args,
      id: "query",
      name: key.name,
      onError: () => void queryClient.invalidate(factory, key.args),
      onResult: (value) => queryClient.setData(factory, key.args, value),
    },
  ];
}

/**
 * One subscription per loaded page. Every page but the last is pinned to end
 * where the next page starts (`endCursor`), so items added or removed inside
 * a page grow or shrink that page instead of shifting items across page
 * boundaries — the gaps and duplicates of re-running each page's original
 * `numItems` window.
 */
function pageSubscriptions(
  key: Extract<LiveKey, { kind: "paginated" }>,
  opts: { cursors: ReadonlyArray<string | null>; queryClient: QueryClient<ConvexReader> },
): ReadonlyArray<Subscription> {
  const factory = convexPaginatedQuery(makeFunctionReference<"query">(key.name));
  const input = { args: key.args, numItems: key.numItems };
  return opts.cursors.map((cursor, index) => {
    const endCursor = opts.cursors[index + 1];
    const paginationOpts: PaginationOptions =
      endCursor === undefined
        ? { cursor, numItems: key.numItems }
        : { cursor, endCursor, numItems: key.numItems };
    return {
      args: { ...key.args, paginationOpts },
      id: JSON.stringify([index, cursor, endCursor ?? null]),
      name: key.name,
      onError: () => void opts.queryClient.invalidate(factory, input),
      onResult: (page) => {
        const data = opts.queryClient.getData(factory, input);
        if (data?.pageParams[index]?.cursor !== cursor) {
          return;
        }
        opts.queryClient.setData(factory, input, {
          pageParams: data.pageParams,
          pages: data.pages.with(index, page),
        });
      },
    };
  });
}

function subscriptionsFor(
  query: Query.Query,
  queryClient: QueryClient<ConvexReader>,
): ReadonlyArray<Subscription> {
  const key = liveKey(query.key);
  const state = Query.getUnsafe(query);
  if (!key || !state.hasData) {
    return [];
  }
  switch (key.kind) {
    case "query": {
      return querySubscriptions(key, queryClient);
    }
    case "paginated": {
      const cursors = pageCursors(state.data);
      return cursors ? pageSubscriptions(key, { cursors, queryClient }) : [];
    }
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/** A live subscription: `redeliver` writes its latest result again, ignoring errors. */
interface Watching {
  redeliver(): void;
  unsubscribe(): void;
}

const claimed: Watching = { redeliver: noop, unsubscribe: noop };

function subscribe(subscription: Subscription, client: ConvexWatchClient): Watching {
  const watch = client.watchQuery(
    makeFunctionReference<"query">(subscription.name),
    subscription.args,
  );
  const update = (opts: { reportErrors: boolean }) => {
    let value;
    try {
      value = watch.localQueryResult();
    } catch {
      if (opts.reportErrors) {
        subscription.onError();
      }
      return;
    }
    if (value !== undefined) {
      subscription.onResult(value);
    }
  };
  const unsubscribe = watch.onUpdate(() => update({ reportErrors: true }));
  // A result the client already holds (the read that filled the entry keeps
  // its subscription briefly) won't trigger `onUpdate` again.
  update({ reportErrors: true });
  return { redeliver: () => update({ reportErrors: false }), unsubscribe };
}

/**
 * Keeps every Convex entry in a browser `QueryClient` live: while an entry is
 * cached and has data, it is subscribed with `watchQuery` and every result is
 * written into the cache. Entries leave Convex when they leave the cache
 * (`gcTime` after their last reader), so navigating back shows current data
 * without a refetch. Returns the disconnect.
 */
export function connectConvexLive(opts: {
  client: ConvexWatchClient;
  queryClient: QueryClient<ConvexReader>;
}): () => void {
  /** Entry hash → subscription id → its watch. */
  const live = new Map<string, Map<string, Watching>>();
  /** Hashes of live entries with a full refetch in flight. */
  const fetching = new Set<string>();

  const stop = (hash: string) => {
    const subscriptions = live.get(hash);
    live.delete(hash);
    fetching.delete(hash);
    for (const watching of subscriptions?.values() ?? []) {
      watching.unsubscribe();
    }
  };

  /**
   * A full refetch replaces the data with what it read, page by page, so it
   * can undo results written while it ran. Write the subscriptions' latest
   * results again once it lands. (A page load keeps them.)
   */
  const redeliverAfterRefetch = (query: Query.Query) => {
    const state = Query.getUnsafe(query);
    if (state.isFetching) {
      if (live.has(query.hash) && state.fetchDirection === undefined) {
        fetching.add(query.hash);
      }
      return;
    }
    if (!fetching.delete(query.hash) || state.status !== "success") {
      return;
    }
    for (const watching of live.get(query.hash)?.values() ?? []) {
      watching.redeliver();
    }
  };

  const sync = (query: Query.Query) => {
    const wanted = new Map(
      subscriptionsFor(query, opts.queryClient).map((subscription) => [
        subscription.id,
        subscription,
      ]),
    );
    if (wanted.size === 0) {
      stop(query.hash);
      return;
    }
    const current = live.get(query.hash) ?? new Map<string, Watching>();
    live.set(query.hash, current);
    for (const [id, watching] of current) {
      if (!wanted.has(id)) {
        current.delete(id);
        watching.unsubscribe();
      }
    }
    for (const [id, subscription] of wanted) {
      if (!current.has(id)) {
        // Claimed before subscribing: a result the client already holds is
        // written synchronously, and that cache update re-enters `sync`.
        current.set(id, claimed);
        current.set(id, subscribe(subscription, opts.client));
      }
    }
  };

  const unsubscribe = opts.queryClient.subscribe((event) => {
    if (event.type === "removed") {
      stop(event.query.hash);
      return;
    }
    sync(event.query);
    redeliverAfterRefetch(event.query);
  });
  for (const query of opts.queryClient.getAll()) {
    sync(query);
  }

  return () => {
    unsubscribe();
    for (const hash of live.keys()) {
      stop(hash);
    }
  };
}
