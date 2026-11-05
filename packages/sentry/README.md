# `@workspace/sentry`

One Sentry setup for every app in this monorepo. Projects live in the `trpclabs`
org and are named `personal-<app>`, for example `personal-isbabyoutyet` and
`personal-sous-vide-guide`. An app with Convex also gets
`personal-<app>-backend`, platform Node.js, for example
`personal-isbabyoutyet-backend`. `personalProjectSlug` and
`personalBackendProjectSlug` in `src/project.ts` are those rules.

The TanStack Start SDK (`@sentry/tanstackstart-react`) reports errors and
traces. Production source maps upload when `SENTRY_AUTH_TOKEN` is set. Convex
reports uncaught function errors through its own integration, configured per
deployment. `src/capture.ts` is only for an error a Convex function catches
and does not rethrow: the isolate cannot load the SDK.

## Wire a new TanStack Start app

1. Create a Sentry project named `personal-<directory>` (the directory under
   `projects/`). If the app has Convex, also create
   `personal-<directory>-backend` with platform Node.js.
2. Set `VITE_SENTRY_DSN` to that project's DSN on the web host. Set
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

## Convex

Convex reports uncaught function errors itself. Do not catch an error, report
it, and rethrow: the same failure would show up twice. Email rendering runs
inside a Convex function, so a render failure should throw and let Convex
report it.

The integration is per deployment, and only on the Pro plan. There is no CLI
or API for it.

1. Open the deployment in the Convex dashboard.
2. Go to Settings → Integrations.
3. Open the Sentry card and paste the DSN for `personal-<app>-backend`.
   That project is platform Node.js, which is what Convex uses to process
   stack traces. The web app's `personal-<app>` project stays JavaScript.

Repeat for production, each preview you care about, and the dev deployment.

If a function catches an error and does not rethrow, call
`captureConfiguredException({ cause, runtime: "convex" })`. It reads
`SENTRY_DSN` from that deployment and does nothing when the variable is unset.
Deploys do not copy it. `runtime: "email"` is the same helper for a swallowed
failure inside the email renderer.
