# Is Baby Out Yet

Monorepo for **Is Baby Out Yet?** and sibling products.

## Layout

```
projects/
  isbabyoutyet/
    web/       @isbabyoutyet/web       TanStack Start app
    backend/   @isbabyoutyet/backend   Convex backend
    email/     @isbabyoutyet/email     React Email templates
  sous-vide-guide/                     (stacked PR) Sous Vide Guide web app
packages/      Shared UI, form-guard, oxlint plugins, prefetch helpers, …
```

Each product under `projects/<name>/` owns its app code, hosting config, and
(if any) backend. Cross-product code stays in `packages/`.

## Setup

Requires **Node.js 24** ([`.nvmrc`](.nvmrc)).

```sh
pnpm install
pnpm dev          # all workspaces
pnpm clean        # wipe install/build caches and reinstall
```

Filter to one product:

```sh
pnpm --filter '@isbabyoutyet/*' dev
```

## Products

- **Is Baby Out Yet?** — [`projects/isbabyoutyet/README.md`](projects/isbabyoutyet/README.md)
  (demo logins, Vercel root directory, Convex, email preview via `pnpm email`)
- **Sous Vide Guide** — added in the stacked PR under `projects/sous-vide-guide/`

## Agent notes

Root [`AGENTS.md`](AGENTS.md) covers monorepo-wide rules (hooks ban, tests,
PRs). Product-specific notes live under each project’s `AGENTS.md`.
