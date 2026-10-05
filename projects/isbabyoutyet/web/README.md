# `@isbabyoutyet/web`

TanStack Start app for Is Baby Out Yet? Runs on
[localhost:3000](http://localhost:3000) under `pnpm dev`. The rules shared by
every web app are in [`projects/`](../../README.md), and the domain terms are in
[the product doc](../README.md#domain-language).

## Overlays

Baby settings, post-update, share preview, and photo lightboxes
(`/baby/$publicId/{settings,post,share,photo}`,
`/baby/$publicId/updates/$updateId/photo`) are nested child routes rendered
into the baby layout's `<Outlet />`, so the page underneath stays mounted. They
open with a pushed history entry and close by going back, using
`@/lib/overlay-nav`. Each overlay has two hooks over one spec:

- **`use…Overlay(params)`** in the route component owns the open state and the
  form guard. Spread `overlay.rootProps` onto the Base UI Root and wrap forms
  in `<FormGuardProvider guard={overlay.guard}>`. `overlay.close()` closes
  unconditionally (after a save). `overlay.requestClose()` behaves like a user
  dismissal. Spread `overlay.closeLinkProps` onto in-overlay close CTAs.
  Presentational components take `OverlayControl`; tests build one with
  `WithOverlayControl` (`@/test/overlayControl`).
- **`use…OverlayLinks(params)`** in layouts and nav docks returns
  `{ openLink, closeLink, dismiss }`. Pass `openLink` to a real `<Link>` so the
  child loader runs before the click. `dismiss()` goes through the mounted
  overlay's guard and falls back to history only when nothing is mounted.

Close navigation runs from `onOpenChangeComplete(false)` with
`ignoreBlocker: true`. The guard has already approved the dismissal, and a
blocked navigation would leave the URL on an invisible overlay. Keep
`replace: true` for slug canonicalization and auth redirects.

## Forms (`@workspace/form-guard`)

Dialog, popover, sheet, and route-overlay forms use `useFormGuard` +
`FormGuardProvider` + `useZodForm` + `Form` from `@/components/Form`.

- Editors opened from a trigger: `useFormGuard({ defaultOpen: false })`, then
  `<Popover {...guard.rootProps}>`.
- When something else owns the open state: `useFormGuard({ open, onOpenChange })`.
  Route overlays get this from `use…Overlay`.
- Full-page forms that only need the navigation guard: `useFormGuard(null)`.

After a successful save, close with `guard.close()`. Never save from
`DialogClose` / `PopoverClose`: they unmount the overlay before the mutation
finishes and skip the guard. Controls that persist immediately (language
select, notification switches) are not forms. Library internals are in
[`packages/form-guard`](../../../packages/form-guard/README.md).

## i18n

UI copy uses English literals as catalog keys: `useI18n().t("…")`, with base
locale `en-GB` and messages in `messages/{locale}.json`. Paraglide handles
locale detection and cookies.

## Tests

Use `createConvexTestHarness` with `renderWithConvexTest` /
`renderMountedFileRoute` so components and routes run against in-memory
`convex-test`. Seed with `seedOwnedBaby`, `signUpTestUser`, or
`seedBabyWithPhoto`, and switch callers with `harness.withIdentity`.

## Deploy (Vercel)

[`vercel.json`](vercel.json) sets the framework, install command, and build
command. The build is a Turbo run of three uncached tasks:

- `@isbabyoutyet/backend#deploy:vercel` pushes `../backend` and writes its URL
  to `.env.production.local` here
  ([`deployVercel.ts`](../backend/scripts/deployVercel.ts)).
- Then two run side by side: `build:vercel` builds this app with `vite build`,
  and `@isbabyoutyet/backend#configure:vercel` sets the backend's env, runs
  migrations, and seeds it
  ([`configureVercel.ts`](../backend/scripts/configureVercel.ts)).

Turbo hashes a task's files before its dependencies run, so a cached web build
could point at the wrong backend; that is why nothing in the run is cached. It
also runs with `--env-mode=loose`: every task sees the Vercel project's
variables, so `turbo.json` doesn't list the ones only the deploy reads. The
`build` task stays strict and cached for local and CI builds.

In the dashboard, set
Root Directory to `projects/isbabyoutyet/web`, turn on "include source files
outside Root Directory", leave the output directory empty, and enable Git LFS
so the demo photos in `backend/assets/` are downloaded.
