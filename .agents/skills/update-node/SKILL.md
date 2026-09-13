---
name: update-node
description: >-
  Bump the repo Node.js major everywhere it is pinned. Use when upgrading Node,
  changing .nvmrc, engines.node, Convex nodeVersion, GitHub Actions setup-node,
  Vercel Node.js Version, or fixing CI warnings that Node 20 actions are
  deprecated.
---

# Update Node.js

Current major: **24**. Edit every pin below in the same change.

| Place | What to set |
| --- | --- |
| [`.nvmrc`](../../../.nvmrc) | The major (`24`). Source of truth for nvm/fnm and CI. |
| [`package.json`](../../../package.json) `engines.node` | `^<major>.0.0`. pnpm, and Vercel (overrides Project Settings on the next deploy). |
| [`projects/baby-outlet/backend/convex.json`](../../../projects/baby-outlet/backend/convex.json) `node.nodeVersion` | The major (Convex `"use node"` actions). |
| [`.github/workflows/main.yml`](../../../.github/workflows/main.yml) | Keep `node-version-file: .nvmrc`. Do not hardcode a second version. |
| [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml) catalog `@types/node` | Only if types need a bump. |
| Vercel → Project → Settings → Build and Deployment → Node.js Version | Same major (`24.x`). Dashboard deprecation still follows this setting even when `engines.node` overrides the deploy. |
| Cursor Cloud environment snapshot | Install the same major so agents match `.nvmrc`. |

There is no Node pin in [`projects/baby-outlet/web/vercel.json`](../../../projects/baby-outlet/web/vercel.json).

## GitHub Actions runtimes

Separate from the app Node `setup-node` installs. Each JavaScript action declares `runs.using` in its `action.yml`. A leftover `@v4` on `actions/checkout`, `actions/setup-node`, `actions/cache` (including `restore`/`save`), or `pnpm/action-setup` is what produces the CI warning that Node 20 is deprecated.

When GitHub deprecates an action runtime, bump those majors to releases whose `action.yml` says `node24` (or newer). Then `pnpm install` and `pnpm checks`.
