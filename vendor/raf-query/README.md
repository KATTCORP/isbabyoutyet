# Vendored raf-query

`@raf-query/core` and `@raf-query/react`, built from an unreleased branch of
[KATT/raf-query](https://github.com/KATT/raf-query). The `overrides` in
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) point both packages at the
tarballs here.

To rebuild them from a checkout of that branch:

```sh
./vendor/raf-query/pack.sh ../raf-query
pnpm install
```

Once the branch is released, set the release in the catalog, and delete the
two overrides and this directory.
