# KitchenLab

Browsable cooking guides for KitchenLab — temperatures, times, and techniques
that are easy to search and filter instead of buried in long blog posts.

## Workspaces

- `web/` — `@kitchenlab/web`, a TanStack Start application with Paraglide
  (`sv` + `en`)

From the repository root:

```sh
pnpm --filter @kitchenlab/web dev
```

Runs on port `3002`. The guide content is product-owned TypeScript data under
`web/src/data`. There is no Convex backend yet; add one under this product if
accounts or editable content become necessary.

The first guide is the sous vide temperature table from
[KitchenLab’s köksguide #9](https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/).
