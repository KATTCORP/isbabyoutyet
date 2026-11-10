# Loader waterfall examples

`convexQuery` / `convexPaginatedQuery` come from `@workspace/convex-query`; `load`, `swr` and `prefetch` from `@raf-query/react`; `queryClient` is `opts.context.queryClient`.

## ❌ Waterfall: resolve id, then prefetch dependents

```typescript
beforeLoad: async (opts) => {
  const [, data] = await load(queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId }),
  });
  if (!data.baby) throw notFound();
  return { babyId: data.baby._id };
},

loader: async (opts) => {
  const babyId = opts.context.babyId; // loader blocked on beforeLoad
  const [handles] = await load(queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId }),
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId }, // cannot start until beforeLoad finishes
      numItems: 20,
    }),
  });
  return handles;
};
```

Problems: `beforeLoad` → `loader` serializes; timeline prefetch waits on baby resolution even though the URL slug is enough.

## ✅ Parallel: slug everywhere

```typescript
beforeLoad: async (opts) => {
  // routing only: 404, redirect stale slug, locale
  const [, data] = await load(queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: opts.params.publicId }),
  });
  const baby = data.baby;
  if (!baby) throw notFound();
  if (baby.publicId !== opts.params.publicId) {
    throw redirect({ to: "/baby/$publicId", params: { publicId: baby.publicId } });
  }
  return { locale: baby.resolvedLocale };
},

loader: async (opts) => {
  const publicId = opts.params.publicId;
  const [handles] = await load(queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: publicId }), // cache hit
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId: publicId },
      numItems: 20,
    }),
    myAccess: swr(convexQuery(api.coParents.myAccess), { babyId: publicId }),
  });
  return handles;
};
```

Backend queries accept `v.union(v.id("baby"), v.string())` and resolve internally.

## ❌ Waterfall: auth setup in page loader

```typescript
loader: async (opts) => {
  const token = await getAuthToken(opts);
  opts.context.convexHttpClient?.setAuth(token);
  await load(queryClient, { me: swr(convexQuery(api.profile.get), {}) });
  const [handles] = await load(queryClient, { /* … */ });
  return handles;
};
```

Auth and profile loading belong on the authenticated layout, not page loaders.

## ❌ Sequential loads inside loader

```typescript
loader: async (opts) => {
  const [, data] = await load(queryClient, {
    baby: swr(convexQuery(api.baby.getByPublicId), { id: publicId }),
  });
  const [handles] = await load(queryClient, {
    timeline: swr(convexPaginatedQuery(api.timeline.listByBaby), {
      args: { babyId: data.baby._id },
      numItems: 20,
    }),
  });
  return handles;
};
```

Name both in one `load` instead, keyed by the slug.

## ✅ Browser-only: started in the browser, never on the server

```typescript
loader: async (opts) => {
  void load(queryClient, {
    browserPush: inBrowser(queryClient, prefetch(browserPushCapabilityQuery, opts.params.publicId)),
  });
  const [handles] = await load(queryClient, { /* convex only */ });
  return handles;
};
```

`inBrowser` skips the entry on the server (`skipToken`), and `load` never waits for a `prefetch`. The component reads it with `useBrowserPushCapability(publicId)`, which builds its handle with `browserOnlyHandle` and is `null` until detection finishes in the browser.
