# Loader waterfall examples

`convexQuery` / `convexPaginatedQuery` come from `@workspace/convex-query`; `queryClient` is `opts.context.queryClient`.

## ❌ Waterfall: resolve id, then prefetch dependents

```typescript
beforeLoad: async (opts) => {
  await queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId });
  const baby = queryClient.getData(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId });
  if (!baby) throw notFound();
  return { babyId: baby._id };
},

loader: async (opts) => {
  const babyId = opts.context.babyId; // loader blocked on beforeLoad
  return await allKeyed({
    baby: queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId }),
    timeline: queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId, visitorId: null }, // cannot start until beforeLoad finishes
      numItems: 20,
    }),
  });
};
```

Problems: `beforeLoad` → `loader` serializes; timeline prefetch waits on baby resolution even though the URL slug is enough.

## ✅ Parallel: slug everywhere

```typescript
beforeLoad: async (opts) => {
  // routing only: 404, redirect stale slug, locale
  await queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId });
  const baby = queryClient.getData(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId });
  if (!baby) throw notFound();
  if (baby.publicId !== opts.params.publicId) {
    throw redirect({ to: "/baby/$publicId", params: { publicId: baby.publicId } });
  }
  return { locale: baby.resolvedLocale };
},

loader: async (opts) => {
  const publicId = opts.params.publicId;
  return await allKeyed({
    baby: queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: publicId }), // cache hit
    timeline: queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId: publicId, visitorId: null },
      numItems: 20,
    }),
    myAccess: queryClient.ensure(convexQuery(api.coParents.myAccess), { babyId: publicId }),
  });
};
```

Backend queries accept `v.union(v.id("baby"), v.string())` and resolve internally.

## ❌ Waterfall: auth setup in page loader

```typescript
loader: async (opts) => {
  const token = await getAuthToken(opts);
  opts.context.convexHttpClient?.setAuth(token);
  await queryClient.ensure(convexQuery(api.profile.get), {});
  return await allKeyed({ /* … */ });
};
```

Auth and profile loading belong on the authenticated layout, not page loaders.

## ❌ Sequential awaits inside loader

```typescript
loader: async (opts) => {
  await queryClient.ensure(convexQuery(api.baby.getByPublicId), { id: publicId });
  const baby = queryClient.getData(convexQuery(api.baby.getByPublicId), { id: publicId });
  const timeline = await queryClient.ensure(convexPaginatedQuery(api.timeline.listByBaby), {
    args: { babyId: baby._id, visitorId: null },
    numItems: 20,
  });
  return { timeline };
};
```

Use `allKeyed` instead.

## ✅ Client-only: non-blocking prefetch handle

```typescript
loader: async (opts) => {
  const browserPush = prefetchBrowserPushCapability(queryClient, opts.params.publicId);
  const data = await allKeyed({ /* convex only */ });
  return { browserPush, ...data };
};
```

`browserPush` returns immediately (and does nothing on the server); the component reads it with `useBrowserPushCapability(handle)`, which is `null` until detection finishes in the browser.
