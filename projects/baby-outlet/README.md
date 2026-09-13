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

Update the **existing** baby-outlet Vercel project (do not create a second one):

1. Project → **Settings → General → Root Directory** → set to
   `projects/baby-outlet/web` (was `apps/web`) → Save.
2. **Settings → General → Framework Settings**
   - Framework Preset: **TanStack Start** (matches `vercel.json`)
   - Build Command: override **off**, or `pnpm deploy-convex`
   - Output Directory: override **off** / empty (Nitro emits `.vercel/output`)
   - Install Command: override **off**, or `cd ../../.. && pnpm install`
     (three `..`, not two — the app is one level deeper than `apps/web`)
3. **Settings → Environment Variables** — leave as-is (`CONVEX_DEPLOY_KEY`,
   `BETTER_AUTH_SECRET`, Resend, VAPID, etc.). Same Convex deployment.
4. Redeploy the latest Production deployment (Deployments → … → Redeploy).

`web/vercel.json` is the source of truth for install/build once Root Directory
points at `projects/baby-outlet/web`. The deploy script resolves the Convex
package at `../backend` automatically — no Convex dashboard path change.
