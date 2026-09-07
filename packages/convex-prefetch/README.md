# Convex prefetch — funcRef-first loader handles for TanStack Query

SSR/loader prefetching for Convex on TanStack Query where **the Convex
function reference is the interface** — no per-query factory registry.

Plain queries ride on `convexQuery` from `@convex-dev/react-query`; paginated
queries get cursor-paged infinite queries with SSR and live `watchQuery` page
sync.

## Setup (router)

```ts
import { ConvexQueryClient } from "@convex-dev/react-query";
import { convexInfiniteQueryFn } from "@workspace/convex-prefetch";

const convexQueryClient = new ConvexQueryClient(convexUrl);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexInfiniteQueryFn(convexQueryClient),
    },
  },
});
```

`convexInfiniteQueryFn` is the only place the Convex client is wired in: it
handles plain `convexQuery` keys and paginated `convexInfiniteQuery` keys, on
the client and during SSR (via `serverHttpClient`). Nothing is stored in module
state, so a server that builds one router (and one QueryClient) per request
keeps each request's authenticated client to itself.

## Loader

```ts
import { allKeyed } from "@workspace/query-prefetch";

loader: async (opts) => {
  const preloader = opts.context.convexPreloader;
  return await allKeyed({
    profile: preloader.ensureQueryData(api.profile.get, {}),
    timeline: preloader.ensureInfiniteQueryData(api.timeline.listByBaby, {
      args: { babyId },
      numItems: 20,
    }),
  });
};
```

`convexPreloader` is created once in `getRouter()` via `getConvexQueryPreloader(queryClient)` and passed on router context.

## Read site

```tsx
const profileQuery = usePreloadedConvexQuery(api.profile.get, loaderData.profile);

const timelineQuery = usePreloadedConvexInfiniteQuery(api.timeline.listByBaby, {
  handle: loaderData.timeline,
  // remix args held in local state the URL doesn't capture; identity on first render
  remixArgs: (args) => ({ ...args, visitorId }),
});
const items = timelineQuery.data.pages.flatMap((page) => page.page);
```

`usePreloadedConvexInfiniteQuery` subscribes every loaded page to Convex
`watchQuery`, so pages stay live without extra wiring.

## Client-only inputs

When the input only exists in the browser (e.g. a push endpoint), initiate at
render and read through the same handle shape:

```tsx
const handle = useInitiateConvexQuery(api.pushSubscriptions.isSubscribed, {
  babyId,
  endpoint,
});
const isSubscribedQuery = usePreloadedConvexQuery(api.pushSubscriptions.isSubscribed, handle);
```

## Testing

`@workspace/convex-prefetch/test-helpers` exports
`testPreloadedConvexQuery` / `testPreloadedConvexInfiniteQuery` to build typed
handles for component tests.
