# Baby Outlet

This product contains the Is Baby Out Yet web application and its dedicated
Convex backend.

## Workspaces

- `web/` — `@baby-outlet/web`, the TanStack Start application
- `backend/` — `@baby-outlet/backend`, its Convex functions, schema,
  development setup, and product assets

Code used by multiple products belongs in the repository-level `packages/`
directory. Product-specific code stays here so the application can be developed,
tested, and deployed without depending on another product's implementation.

From the repository root, `pnpm dev` starts every workspace. Use
`pnpm --filter '@baby-outlet/*' dev` to work on this product alone.

## Environment ownership

The web app owns its local Vite environment files. The backend owns its Convex
deployment and deployment-scoped environment variables. Another product should
use separate environment files, hosting configuration, and a separate Convex
deployment rather than adding product prefixes to Baby Outlet variables.
