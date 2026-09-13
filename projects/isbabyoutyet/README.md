# Is Baby Out Yet

Web app, Convex backend, and email templates for
[isbabyoutyet.com](https://isbabyoutyet.com).

## Workspaces

| Path | Package | Role |
| --- | --- | --- |
| `web/` | `@isbabyoutyet/web` | TanStack Start application |
| `backend/` | `@isbabyoutyet/backend` | Convex functions, schema, seed assets |
| `email/` | `@isbabyoutyet/email` | React Email templates (password reset, …) |

Shared libraries used by more than one product stay in the repo-level
`packages/` directory.

From the repository root, `pnpm dev` starts every workspace. Work on this
product alone with:

```sh
pnpm --filter '@isbabyoutyet/*' dev
```

## Environment ownership

The web app owns its local Vite environment files. The backend owns its Convex
deployment and deployment-scoped environment variables. Email templates are
compiled into the backend send path — they are not a separate deployable.
Another product should use its own env files, hosting, and (if needed) Convex
deployment rather than prefixing Is Baby Out Yet variables.

## Demo logins

Local and Vercel preview backends seed:

- `test@example.com` / `password` — babies in every status
- `test+newuser@example.com` / `password` — empty dashboard / first-run tour
- `test+coparent@example.com` / `password` — co-parent on Milo (`/baby/baby-born`)

Re-run with `pnpm --filter @isbabyoutyet/backend seed` (idempotent). Wipe the
local anonymous Convex DB with `pnpm reset-dev`, then `pnpm dev`.

Demo photos live in Git LFS (`backend/assets/homepage-demo/`). Enable Git LFS
in the Vercel project Git settings so builds receive the actual images.

## Deploy (Vercel)

Update the **existing** Is Baby Out Yet Vercel project (do not create a second
one for this product):

1. **Settings → General → Root Directory** → `projects/isbabyoutyet/web`
   (was `apps/web`). Keep “include source files outside Root Directory” on.
2. **Framework Settings**
   - Framework Preset: **TanStack Start**
   - Build Command: override off, or `pnpm deploy-convex`
   - Output Directory: empty (Nitro writes `.vercel/output`)
   - Install Command: override off, or `cd ../../.. && pnpm install`
3. **Environment Variables** — unchanged (`CONVEX_DEPLOY_KEY`, auth/email/VAPID, …).
4. Redeploy Production.

The deploy script resolves the Convex package at `../backend` and the email
package via the workspace — no Convex dashboard path change.

## Agents / Convex AI files

See [`AGENTS.md`](AGENTS.md) and [`backend/AGENTS.md`](backend/AGENTS.md).
Convex skills under `backend/.agents/skills/` are maintained with
`npx convex ai-files install` from `backend/`.
