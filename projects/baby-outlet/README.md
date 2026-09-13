# Baby Outlet

This project contains the Is Baby Out Yet web application and its dedicated
Convex backend.

## Workspaces

- `web/` — `@baby-outlet/web`, the TanStack Start application
- `backend/` — `@baby-outlet/backend`, its Convex functions, schema,
  development setup, and project assets

Code used by multiple projects belongs in the repository-level `packages/`
directory. Project-specific code stays here so the application can be developed,
tested, and deployed without depending on another project's implementation.

From the repository root, `pnpm dev` starts every workspace. Use
`pnpm --filter '@baby-outlet/*' dev` to work on this project alone.

## Environment ownership

The web app owns its local Vite environment files. The backend owns its Convex
deployment and deployment-scoped environment variables. Another project should
use separate environment files, hosting configuration, and a separate Convex
deployment rather than adding project prefixes to Baby Outlet variables.

## Deploy (Vercel)

The Vercel project's **Root Directory** is `projects/baby-outlet/web`.
`web/vercel.json` installs from the monorepo root (`cd ../../.. && pnpm install`)
and builds with `pnpm deploy-convex`, which deploys the Convex backend in
`backend/` and then builds the web app.
