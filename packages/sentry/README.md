# `@workspace/sentry`

One Sentry setup for the web apps in this monorepo. Projects live in the
`trpclabs` org and are named `personal-<app>`, for example `personal-isbabyoutyet`
and `personal-sous-vide-guide`. `personalProjectSlug` in `src/project.ts` is
that rule.

The TanStack Start SDK (`@sentry/tanstackstart-react`) reports errors and
traces. Production source maps upload when `SENTRY_AUTH_TOKEN` is set.
Events are tagged with `VERCEL_ENV` (`production` or `preview`) in the browser
and on the server, so preview deploys don't count as production.

Web and Convex share that one project. Convex reports uncaught function errors
through its dashboard integration (Settings → Integrations → Sentry, per
deployment), tagged `runtime: "convex"`. This package does not capture them.

## Wire a new TanStack Start app

1. Create a Sentry project named `personal-<directory>` (the directory under
   `projects/`).
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

With `SENTRY_AUTH_TOKEN` set, Sentry's plugin wraps the app's `src/server.ts`
with an import of the SDK. The apps depend on this package and not on the SDK,
so `sentryVitePlugins` resolves that import from here. A build without the
token never takes that path: to check a change to the server entry or to this
package, build once with any value, for example
`SENTRY_AUTH_TOKEN=x pnpm --filter @isbabyoutyet/web build`. The upload then
fails with a 401, which does not fail the build.
