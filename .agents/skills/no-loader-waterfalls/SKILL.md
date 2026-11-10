---
name: no-loader-waterfalls
description: >-
  Eliminate sequential awaits in TanStack Router loaders and Convex prefetch.
  Use when adding or changing route loaders, beforeLoad, SSR prefetch, raf-query
  load / swr / prefetch, or when the user mentions loader waterfalls, parallel
  prefetch, or blocking loader chains.
---

# No loader waterfalls

**Rule:** independent data fetches in a loader must run in parallel. Never `await` query A so you can pass its result into query B when B could accept the same URL input A needed.

## Loader shape

One raf-query `load(queryClient, { … })` naming every independent query. `load` starts every entry before it waits for any, so the order of the entries can't create a waterfall. `swr(factory, input)` waits until the cache has data (Convex entries are live, so cached data is current); `prefetch` starts a query without waiting. `load` resolves to `[handles, data]`: serializable handles to return, and the data of `swr` / `revalidate` entries for the loader's own checks. Components read a handle with `const [thenable] = useQuery(factory, handle)` and `use(thenable)` (`useInfiniteQuery` for paged queries), which doesn't suspend for what the loader waited for.

```typescript
loader: async (opts) => {
  const publicId = opts.params.publicId;
  const [handles] = await load(opts.context.queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: publicId }),
    profile: swr(convexQuery(api.profile.get), {}),
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId: publicId },
      numItems: TIMELINE_PAGE_SIZE,
    }),
    // …every other independent query
  });
  return handles;
};
```

Build factories inline with `convexQuery(api.x.y)` / `convexPaginatedQuery(api.x.y)` from `@workspace/convex-query`; every call for one function returns the same factory and entries are keyed by function name and args, so there is no registry. When the loader itself needs a value (404, redirect), read it from `load`'s data (`const [, data] = await load(…)`), or with `getData(queryClient, factory, input)` once an earlier `load` has it. A load that must run alongside another kind of work (`loadTimelineFeed`) goes in one `Promise.all` with it.

Reference: [`projects/isbabyoutyet/web/src/routes/baby/$publicId/route.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId/route.tsx).

## beforeLoad vs loader

| Concern | Where |
|--------|--------|
| 404, redirect, locale for routing | **`beforeLoad` only** |
| Prefetch everything the page reads | `loader` (parallel) |

Do **not** duplicate `throw notFound()` in the loader when `beforeLoad` already validated the route — that adds a serial dependency on re-checking data the loader prefetched in parallel.

`beforeLoad` may fetch one record for routing, but **must not** be the only way the loader gets IDs for sibling prefetches. The loader passes **route params** (slug, id from URL) directly to every related query.

### beforeLoad blocks every navigation

`beforeLoad` re-runs serially (root → leaf) on **every** navigation, back button
included, and the router blocks on each one. On the client path it may only do
zero-network work (cache hits via `load` + `swr`, local locale detection).
Never call a `createServerFn` on the client branch of a `beforeLoad` — that
adds an HTTP round-trip to every navigation and defeats viewport preloading
(regression history: PR #108 fixed this, PR #112 reintroduced it in the root
route). Guard with `typeof window === "undefined"` and resolve locally on the
client, e.g. `getDetectedLocale()` instead of `detectRequestLocale()`.

❌ Resolve entity in `beforeLoad`, pass `babyId` into loader, then prefetch baby-scoped queries sequentially or gated on that id.

✅ Loader passes `opts.params.publicId` (or equivalent) to all baby-scoped queries at once.

## Backend: accept the URL key

When many queries need the same entity, add a shared resolver and widen read-query args to accept **id or public slug** — not only `v.id("table")`.

Pattern (see [`projects/isbabyoutyet/backend/convex/babyLookup.ts`](../../../projects/isbabyoutyet/backend/convex/babyLookup.ts)):

```typescript
export const babyIdOrPublicIdValidator = v.union(v.id("baby"), v.string());

export async function findBabyByIdOrPublicId(db, ref) {
  const normalizedId = db.normalizeId("baby", ref);
  const [byId, byPublicId, historyEntry] = await Promise.all([
    normalizedId ? db.get(normalizedId) : null,
    db.query("baby").withIndex("by_publicId", (q) => q.eq("publicId", ref)).first(),
    db.query("babyPublicIdHistory").withIndex("by_publicId", (q) => q.eq("publicId", ref)).order("desc").first(),
  ]);
  // pick first hit…
}
```

- **Read queries** used in loaders: accept `babyIdOrPublicIdValidator` (or your domain equivalent).
- **Mutations**: keep strict `v.id("baby")`; components use `_id` from loaded data.

Resolver lookups inside Convex should also parallelize (`Promise.all`), not chain fallbacks.

## Client-only prefetch

Browser-only inputs (push permission, the service worker, `localStorage`) must not block SSR or serialize the loader. Their factories set `meta: { browserOnly: true }`; the app's `browserOnly` link never starts them on a server client, and `dehydrateBrowserOnly` keeps them out of the SSR stream.

```typescript
// Started in the browser alongside the route's data; skipped on the server.
void load(queryClient, {
  browserPush: inBrowser(queryClient, prefetch(browserPushCapabilityQuery, publicId)),
});
const [handles] = await load(queryClient, { /* convex */ });
return handles;
```

After SSR no loader started them, so their readers build their own handles with `browserOnlyHandle(factory, input)` and read the thenable's `status` instead of `use()`, so the server renders the "unknown yet" state without suspending or detecting. On a client navigation the read joins the request the loader already started.

Reference: [`browser-only.ts`](../../../projects/isbabyoutyet/web/src/lib/browser-only.ts), [`browser-push-capability.ts`](../../../projects/isbabyoutyet/web/src/lib/browser-push-capability.ts) and [`use-browser-push-capability.ts`](../../../projects/isbabyoutyet/web/src/lib/use-browser-push-capability.ts).

## Do not re-fetch auth in page loaders

Auth token wiring belongs on the root / layout. Do not duplicate in every page loader:

- `convexClient.setAuth(...)` + waiting for token
- Profile creation belongs to auth hooks; authenticated layouts read `profile.get`

Gated manager queries should return a **sentinel** (`FORBIDDEN`) for anonymous callers so the same loader runs for everyone.

## Anti-patterns checklist

Before merging loader work, verify:

- [ ] No `await` chain where step N+1 only needs something available from the URL or static args
- [ ] All independent prefetches are entries of one `load`
- [ ] No server-function calls on the client branch of any `beforeLoad`
- [ ] Loader tests assert parallel prefetch inputs (e.g. slug passed to every baby query, not only after a prior fetch)
- [ ] No auth/profile side effects duplicated from root SSR
- [ ] Browser-only queries use `inBrowser(queryClient, prefetch(…))`, not blocking loader awaits, and their readers `browserOnlyHandle`

## When a waterfall is acceptable

Sequential awaits are fine when step B **truly depends** on step A's *response body* (not just its id), and that dependency cannot be expressed as a shared URL key or backend resolver. Document why in a one-line comment.

## Tests

Loader tests should stub query handlers (`stubQueryClientResource` in `src/test/stubQueryClient.ts`) and assert **which queries fire** with **which inputs**, without requiring a prior fetch to supply ids. See [`$publicId.test.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId.test.tsx).

## Related docs

- [`packages/convex-query/README.md`](../../../packages/convex-query/README.md) — Convex factories, readers, and the live bridge for raf-query
- [`examples.md`](examples.md) — before/after refactors
