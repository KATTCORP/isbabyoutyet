# Convex for raf-query

Convex queries as [raf-query](https://github.com/KATT/raf-query) query
factories: loaders `ensure` them for SSR and instant client navigation, and a
live bridge keeps every cached entry subscribed, so components read plain
`useQuery` data that Convex keeps current.

## Layers

```
reader.ts   ConvexReader Effect service: browser watch reads, server snapshot reads
queries.ts  convexQuery / convexPaginatedQuery factories (stable keys, Effect queryFns)
live.ts     connectConvexLive: subscribe cached entries, write results into the cache
            watchConvexQuery: one entry's values as an Effect Stream
testing.ts  makeTestConvexClient: a watch client over any async runner (convex-test)
```

Query functions are Effects that `yield* ConvexReader`; each `QueryClient`
provides its own reader through `layer`. That keeps a server request's
authenticated `ConvexHttpClient` scoped to the request.

## Wiring

```tsx
const queryClient = new QueryClient({
  layer: isServer
    ? ConvexReader.layerSnapshot(convexHttpClient) // one consistent snapshot per request
    : ConvexReader.layerWatch(convexReactClient),
});
if (!isServer) {
  connectConvexLive({ client: convexReactClient, queryClient });
}
```

## Usage

Call the factories inline with a function reference; there is no registry to
maintain. Cache entries are keyed by function name and args, so two
`convexQuery(api.profile.get)` calls address the same entry.

Loaders `ensure` (data is cached before render and dehydrated for SSR) and
return the handles; components read the handle:

```tsx
loader: async (opts) =>
  await allKeyed({
    profile: opts.context.queryClient.ensure(convexQuery(api.profile.get), {}),
    timeline: opts.context.queryClient.ensure(
      convexPaginatedQuery(api.timeline.listByBaby),
      { args: { babyId }, numItems: 20 },
    ),
  }),

const [profile] = useQuery(convexQuery(api.profile.get), loaderData.profile);
```

The query functions are Effects with a typed `ConvexQueryError`. Both
factories set `throwOnError: true`, so reads get the data and failures reach
the route's error boundary. Pass `throwOnError: false` on a read to get a
`Result` instead.

Type props that receive a loader handle with `EnsuredConvexQuery<typeof
api.profile.get>` or `EnsuredConvexPaginatedQuery<typeof
api.timeline.listByBaby>`.

`convexPaginatedQuery` is an infinite query over Convex `paginate`. Every
loaded page except the last stays pinned to its end cursor while live, so
inserts and deletes grow or shrink a page instead of shifting items between
pages.

Read data in a loader from the handle `ensure` resolves with:
`(await queryClient.ensure(...)).data`. Effects that compose several reads
(for example push-capability detection) call `readConvexQuery(query, args)`
directly.

## Waiting for a value

`watchConvexQuery({ client, queryClient }, { args, query })` is an Effect
`Stream` of one entry's values: the cached value, then every change. It reads
through the cache (so it shares the request with loaders' `ensure`) and holds
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
`client` to `ConvexReader.layerWatch` and `connectConvexLive`, and call
`refresh()` after a write so live entries re-run, as the server would after a
mutation.
