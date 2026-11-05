# `@workspace/sentry`

One Sentry setup for every app in this monorepo. Projects live in the `trpclabs`
org and are named `personal-<app>`, for example `personal-isbabyoutyet` and
`personal-sous-vide-guide`. `personalProjectSlug` in `src/project.ts` is that
rule.

The TanStack Start SDK (`@sentry/tanstackstart-react`) reports errors and
traces. Production source maps upload when `SENTRY_AUTH_TOKEN` is set. Convex
and email rendering cannot load that SDK, so they post an exception envelope
from `src/capture.ts` to the same project.

## Wire a new TanStack Start app

1. Create a Sentry project named `personal-<directory>` (the directory under
   `projects/`).
2. Set `VITE_SENTRY_DSN` to that project's DSN on the web host. Set the same
   value as `SENTRY_DSN` when the app has a Convex backend. Set
   `SENTRY_AUTH_TOKEN` on the web host so production builds upload source maps.
   Leave them unset locally and the SDK stays off.
3. Copy `src/client.tsx`, `src/instrument.client.ts`, `src/instrument.server.ts`,
   and `src/start.ts` from an existing app. They are the same for every app.
4. In `src/server.ts`, import `./instrument.server` first and pass the fetch
   handler to `wrapFetchWithSentry`.
5. In `src/router.tsx`, call `addRouterTracing(router)` and set
   `defaultOnCatch: reportRouterError`.
6. Spread `sentryVitePlugins({ appName })` last in the Vite plugin list.
   `appName` is the directory name, without the `personal-` prefix.

## Convex and email

Call `captureConfiguredException({ cause, runtime })` when a Convex function or
the email renderer catches a failure, then rethrow. `runtime` is `"convex"` or
`"email"`. It reads `SENTRY_DSN` and does nothing when that variable is unset.
`configure:vercel` copies `SENTRY_DSN` onto the Convex deployment when the
Vercel project has it.
