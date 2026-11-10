# Convex for raf-query

Convex queries as [raf-query](https://raf-query.katt.dev) query factories:
loaders `load` them for SSR and instant client navigation, and a live feature
keeps every cached entry subscribed, so components read plain `useQuery`
data that Convex keeps current.

## Layers

```
reader.ts   ConvexReader Effect service: browser subscribing reads, server snapshot reads
link.ts     convexLink: the client's reader for queryFns
            runConvexEffect: run a queryFn's Effect with the client's reader
queries.ts  convexQuery / convexPaginatedQuery / convexFeedQuery factories, openFeed
live.ts     convexLive: a feature that subscribes cached entries and writes results into the cache
            watchConvexQuery: one entry's values as an Effect Stream
entries.ts  key constants, and decoding a cache entry's key and page params
testing.ts  makeTestConvexClient: a watch client over any async runner (convex-test)
```

Query functions are Effects that `yield* ConvexReader`. raf-query runs plain
promises, so `runConvexEffect` runs them with the reader of the client making
the request (`context.client`), which `convexLink` gives its reader. Each
`QueryClient` takes its own link, which keeps a server request's
authenticated `ConvexHttpClient` scoped to the request.

## Wiring

```tsx
const queryClient = createQueryClient({
  // Browser only; features run while a `QueryClientProvider` has the client mounted.
  features: isServer ? [] : [convexLive(convexReactClient)],
  links: [
    convexLink(
      isServer
        ? ConvexReader.snapshot(convexHttpClient) // one consistent snapshot per request
        : ConvexReader.subscribing(convexReactClient),
    ),
  ],
});
```

## Usage

Call the factories inline with a function reference; there is no registry to
maintain. Every call for one function returns the same factory (raf-query
matches factory targets by identity), and entries are keyed by function name
and args.

Loaders name their queries in one `load` and return the handles; `swr` waits
until the cache has data (Convex data is live, so cached data is current).
Components read the handle with `useQuery` and `use()`:

```tsx
loader: async (opts) => {
  const [handles] = await load(opts.context.queryClient, {
    profile: swr(convexQuery(api.profile.get), {}),
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId },
      numItems: 20,
    }),
  });
  return handles;
},

const [profileThenable] = useQuery(convexQuery(api.profile.get), loaderData.profile);
const profile = use(profileThenable);
const [timelineThenable, timeline] = useInfiniteQuery(
  convexPaginatedQuery(api.timeline.listByBaby),
  loaderData.timeline,
);
```

The query functions fail with a typed `ConvexQueryError` whose message is the
Convex error's, so error boundaries show what the function threw. Factories
never go stale (`staleTime: Infinity`) and don't retry (`meta: { retry: false }`).

Type props that receive a loader handle with `ConvexQueryHandle<typeof
api.profile.get>` or `ConvexPaginatedQueryHandle<typeof
api.timeline.listByBaby>`.

`convexPaginatedQuery` is an infinite query over Convex `paginate`. Every
loaded page except the last stays pinned to its end cursor while live, so
inserts and deletes grow or shrink a page instead of shifting items between
pages.

`convexFeedQuery({ forward, backward })` is a feed: one infinite query per
`args` that opens at an item or at the top and grows both ways, over two
paginated queries with a fixed shape. Both take `from` (an item id, or `null`
for the top) on top of their own args, and page items with an `_id`.
`forward` loads the first page and every `fetchNextPage`. `backward` loads
only on `fetchPreviousPage`, starting right above the first page. raf-query
prepends backward pages, and each page's `pageParams` entry says which
`direction` it came from. Both directions stay live and pinned the same way,
so a backward page that is full never takes in items beyond it until the next
`fetchPreviousPage`. To open with a little context above an item, let the
`forward` query start a few items early.

The input's `from` rides in the page params, not the key, so a feed is one
entry however it was opened. Load it through `openFeed(queryClient,
swr(feed, input))`, which keeps the cached feed while it starts at `from` or
shows the item `from` names, and starts it over at `from` otherwise. Moving
between items the page already shows (a highlighted link, back and forward)
then reads nothing and keeps every page loaded, with no state beyond the URL.

Read data in a loader from `load`'s second element (`const [, data] = await
load(…)`). Effects that compose several reads (for example push-capability
detection) call `readConvexQuery(query, args)` directly, in a `queryFn` run
with `runConvexEffect`.

## Waiting for a value

`watchConvexQuery({ client, queryClient }, { args, query })` is an Effect
`Stream` of one entry's values: the cached value, then every change. It reads
through the cache (so it shares the request with loaders' `load`) and holds
its own Convex subscription while it runs, writing each result into the entry.
Compose it to wait for a value, for example the profile after sign-in:

```ts
watchConvexQuery({ client, queryClient }, { args: {}, query: api.profile.get }).pipe(
  Stream.filter((me) => me !== null),
  Stream.runHead,
  Effect.timeoutOption("10 seconds"),
);
```

## Testing

`makeTestConvexClient(run)` returns `{ client, refresh, subscriptions }`. Pass
`client` to `ConvexReader.subscribing` and `convexLive`, and call `refresh()`
after a write so live entries re-run, as the server would after a mutation.
Outside React, `mount(queryClient)` from `@raf-query/core/internal` starts the
features, as `QueryClientProvider` does.
