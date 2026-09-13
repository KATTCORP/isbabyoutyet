---
name: no-loader-waterfalls
description: >-
  Eliminate sequential awaits in TanStack Router loaders and Convex prefetch.
  Use when adding or changing route loaders, beforeLoad, SSR prefetch, allKeyed,
  ensureQueryData, or when the user mentions loader waterfalls, parallel prefetch,
  or blocking loader chains.
---

# No loader waterfalls

**Rule:** independent data fetches in a loader must run in parallel. Never `await` query A so you can pass its result into query B when B could accept the same URL input A needed.

## Loader shape

One `allKeyed` (or equivalent `Promise.all` of prefetches). Every independent Convex query goes inside it.

```typescript
loader: async (opts) => {
  const preloader = opts.context.convexPreloader;
  const publicId = opts.params.publicId;

  const loaderData = await allKeyed({
    baby: preloader.ensureQueryData(api.baby.getByPublicId, { id: publicId }),
    profile: preloader.ensureQueryData(api.profile.get, {}),
    timeline: preloader.ensureInfiniteQueryData(api.timeline.listByBaby, {
      args: { babyId: publicId },
      numItems: TIMELINE_PAGE_SIZE,
    }),
    // …every other independent prefetch
  });

  return loaderData;
};
```

Reference: [`projects/isbabyoutyet/web/src/routes/baby/$publicId.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId.tsx).

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
zero-network work (cache reads via `ensureQueryData`, local locale detection).
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

Browser-only inputs must not block SSR or serialize the loader.

```typescript
const browserPush = prefetchBrowserPushCapability(opts.context.queryClient);
// non-blocking InitiatedQuery — not inside allKeyed if it would await browser APIs on server

return { browserPush, ...(await allKeyed({ /* convex */ })) };
```

Guard SSR in the prefetch helper (`typeof window === "undefined"`). `skipToken` alone is not enough for `ensureQueryData` on the server.

Reference: [`notification-subscribe.tsx`](../../../projects/isbabyoutyet/web/src/components/baby/notification-subscribe.tsx).

## Do not re-fetch auth in page loaders

Auth token wiring belongs on the root / layout. Do not duplicate in every page loader:

- `convexClient.setAuth(...)` + waiting for token
- Profile creation belongs to auth hooks; authenticated layouts read `profile.get`

Gated manager queries should return a **sentinel** (`FORBIDDEN`) for anonymous callers so the same loader runs for everyone.

## Anti-patterns checklist

Before merging loader work, verify:

- [ ] No `await` chain where step N+1 only needs something available from the URL or static args
- [ ] All independent prefetches are inside one `allKeyed`
- [ ] No server-function calls on the client branch of any `beforeLoad`
- [ ] Loader tests assert parallel prefetch inputs (e.g. slug passed to every baby query, not only after a prior fetch)
- [ ] No auth/profile side effects duplicated from root SSR
- [ ] Client-only queries use initiated handles, not blocking loader awaits on server

## When a waterfall is acceptable

Sequential awaits are fine when step B **truly depends** on step A's *response body* (not just its id), and that dependency cannot be expressed as a shared URL key or backend resolver. Document why in a one-line comment.

## Tests

Loader tests should mock query handlers and assert **which queries fire** with **which inputs**, without requiring a prior fetch to supply ids. See [`$publicId.test.tsx`](../../../projects/isbabyoutyet/web/src/routes/baby/$publicId.test.tsx).

## Related docs

- [`packages/convex-prefetch/README.md`](../../../packages/convex-prefetch/README.md) — preloader + infinite queries
- [`examples.md`](examples.md) — before/after refactors
