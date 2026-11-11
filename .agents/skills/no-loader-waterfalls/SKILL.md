---
name: no-loader-waterfalls
description: >-
  Eliminate sequential awaits in TanStack Router loaders and Convex prefetch.
  Use when adding or changing route loaders, route guards, SSR prefetch, raf-query
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

Build factories inline with `convexQuery(api.x.y)` / `convexPaginatedQuery(api.x.y)` from `@workspace/convex-query`; every call for one function returns the same factory and entries are keyed by function name and args, so there is no registry. When the loader itself needs a value (404, redirect), read it from `load`'s data (`const [, data] = await load(…)`), or with `getData(queryClient, factory, input)` once an earlier `load` has it. When what an entry reads depends on the URL (`?item=`), put that in its input and let the backend query branch, rather than choosing between entries in the loader. A choice that would need another read's result belongs in the backend the same way (`timeline:listFeed` reads the latest feed for a link that doesn't resolve). A list opened at an item is a two-way `convexPaginatedQuery` (its query takes `direction` and `from`), loaded with `swr(list, { args, from, numItems })`: its start is outside the key, and `load` keeps the cached pages while they show `from`, so moving between items they already show reads nothing. The route retains the start for links over or back to it (`search: { middlewares: [retainSearchParams(["item"])] }`), and a link that starts the list over says `item: undefined` and doesn't preload (`preload={false}` on "Jump to latest"): the router preloads links in view, and a preload with another start would run the loader and start the list on screen over.

Reference: [`projects/isbabyoutyet/web/src/routes/baby/$publicId/route.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId/route.tsx).

## Guards that read data go in the loader, not `beforeLoad`

`beforeLoad` runs before any loader, root to leaf, one route after the other, on **every** navigation (back button included): each await in one holds back every loader under it. A `beforeLoad` the router waits for is banned (`workspace/no-async-before-load`). Loaders start together.

A **synchronous** `beforeLoad` holds nothing back and is fine: a redirect the URL alone decides (`?tab=` on the admin index), or route context computed on the spot (the sous vide guide's locale). Write it inline, not `async`, returning an object literal or nothing, so the rule can see the router gets no promise.

| Concern | Where |
|--------|--------|
| 404 or redirect that needs data | the route's `loader`: `throw notFound()` / `throw redirect(…)` after its one `load` |
| Redirect or context from the URL alone | a synchronous `beforeLoad` |
| Everything the page reads | the same `load` |
| What a parent used to hand down in route context (the profile, a flag) | each child's own `load`: the same query in two loaders is one request |
| The request's token and locale on the server | router creation (`requestConvex`, `visitorLocale` in `router.tsx`), not a route |

```typescript
loader: async (opts) => {
  const [, data] = await load(opts.context.queryClient, {
    me: swr(convexQuery(api.profile.get), {}),
  });
  if (!data.me) {
    throw redirect({ replace: true, search: { redirect: opts.location.pathname }, to: "/auth/login" });
  }
  return { locale: data.me.locale };
},
```

The router lets a loader's `redirect()` or `notFound()` win over what the loaders beside it find, whichever settles first. So for a visitor the guard turns away, the child loaders' queries **must answer `null` / `FORBIDDEN` / an empty page, or fail** (`requireAdmin`); none may return another visitor's data and count on the guard. Authorization is the backend's, in every query. The guard is only where the visitor lands.

A parent that stays mounted re-runs its loader in the background on navigation; with the query cached (`profile.get` is live) the guard waits for nothing in the browser.

❌ Load one record to decide the route, then start the page's queries with what it returned.

✅ One `load` with everything the URL names, then check: `opts.params.publicId` goes to every baby-scoped query at once, and a query that needs the record's own id reads it inside its `queryFn` (`visitorTagQuery`).

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

Browser-only inputs (push permission, the service worker, `localStorage`) must not block SSR or serialize the loader. Their factories set raf-query's `ssr: false`: a server client never starts or sends them, and `load` still returns their handle.

```typescript
const [handles] = await load(queryClient, {
  // `prefetch`, never `swr` / `revalidate`: a server can't wait for it.
  browserPush: prefetch(browserPushCapabilityQuery, publicId),
  /* convex */
});
return handles;
```

Pass the handle down like any other. Readers check the thenable's `status` instead of `use()`, so the server renders the "unknown yet" state without suspending; the browser runs the query on its first read (or joins the loader's request on a client navigation).

Reference: [`browser-push-capability.ts`](../../../projects/isbabyoutyet/web/src/lib/browser-push-capability.ts) and [`use-browser-push-capability.ts`](../../../projects/isbabyoutyet/web/src/lib/use-browser-push-capability.ts).

## Do not re-fetch auth in page loaders

Auth token wiring belongs on the root / layout. Do not duplicate in every page loader:

- `convexClient.setAuth(...)` + waiting for token
- Profile creation belongs to auth hooks; authenticated layouts read `profile.get`

Gated manager queries should return a **sentinel** (`FORBIDDEN`) for anonymous callers so the same loader runs for everyone.

## Anti-patterns checklist

Before merging loader work, verify:

- [ ] No `await` chain where step N+1 only needs something available from the URL or static args
- [ ] All independent prefetches are entries of one `load`
- [ ] No `beforeLoad` that awaits or returns a promise: guards that read data throw from the `loader`, and no loader reads data a parent put in route context
- [ ] Loader tests assert parallel prefetch inputs (e.g. slug passed to every baby query, not only after a prior fetch)
- [ ] Browser-only queries set `ssr: false` and load with `prefetch(…)`, never a blocking `swr` / `revalidate`

## When a waterfall is acceptable

Sequential awaits are fine when step B **truly depends** on step A's *response body* (not just its id), and that dependency cannot be expressed as a shared URL key or backend resolver. Document why in a one-line comment.

## Tests

Loader tests should stub query handlers (`stubQueryClientResource` in `src/test/stubQueryClient.ts`) and assert **which queries fire** with **which inputs**, without requiring a prior fetch to supply ids. See [`$publicId.test.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId.test.tsx).

## Related docs

- [`packages/convex-query/README.md`](../../../packages/convex-query/README.md) — Convex factories, readers, and the live bridge for raf-query
- [`examples.md`](examples.md) — before/after refactors
