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

### Forms without JS (`@/lib/form-post`)

A form on a public page should still work while the page's JS is not running:
blocked, still loading, or broken. Describe what it sends once, with
`formPost`, and both ways of sending it read that description:

|            | With JS                                  | Without JS                                                           |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Sent by    | `post.send`, over the Convex client      | the browser, to the form's server function                           |
| Checked by | `fields`, as the visitor types           | `required` / `maxLength` read off `fields`, then `fields` on arrival |
| Arguments  | `args`, with `request: null`             | `args`, with the browser's `request`                                 |
| Afterwards | `handleSubmit` carries on (toast, reset) | a redirect to `landing`, or back to `page` at the form's notice      |

The encouragement form is the one to copy. A form has four parts: the first
two in a file of their own
([`encouragement-post.ts`](src/components/baby/encouragement-post.ts)), the
last two in the component
([`encouragements.tsx`](src/components/baby/encouragements.tsx)):

1. `formPost({ … })`: the mutation, the `fields` the visitor types (a named
   function, so its type is known before `args` is read), what the page
   sends along in hidden inputs (`carried`), and `args`, which turns those
   into the mutation's arguments. Where the two senders know different things
   (a header, `localStorage`), `args` decides, with both cases side by side.
2. Its server function, which only hands the post to `answerFormPost`. It
   has to be a `createServerFn` of its own, at the top of the module, for the
   compiler to find it.
3. `useFormPost(post, { action, carried, defaultValues })` in the component.
4. `<PostForm>` around the fields, with `{...post.native("name")}` on each
   input.

Three things follow from the page being shared by the CDN:

- **`landing` is a URL the CDN has no copy of**, like a new item's permalink.
  The redirect arrives before the purge does, and a shared copy would not
  have what the visitor just did.
- **A failed post shows the form's notice with `:target`.** The notice is
  always in the HTML and the redirect only adds `#<id>-failed`, so nothing is
  rendered for one visitor. What the visitor typed is not kept.
- **The server function takes posts from this site only.** It runs the
  mutation with the visitor's session.

Test the path without JS in jsdom: render the form, read its `FormData`, and
give that to `formPostResponse` with the harness's mutation. A field that is
renamed in one place and not the other fails there.

## i18n

UI copy uses English literals as catalog keys: `useI18n().t("…")`, with base
locale `en-GB` and messages in `messages/{locale}.json`. Paraglide handles
locale detection and cookies.

## Tests

Use `createConvexTestHarness` with `renderWithConvexTest` /
`renderMountedFileRoute` so components and routes run against in-memory
`convex-test`. Seed with `seedOwnedBaby`, `signUpTestUser`, or
`seedBabyWithPhoto`, and switch callers with `harness.withIdentity`.

## Caching

Vercel's CDN keeps server responses so most visitors never reach the server.
[`src/lib/cache.ts`](src/lib/cache.ts) holds all of it, in three rules:

1. **Private unless shared.** A response is `private, no-store` unless its
   route shares it: a page with `headers: () => sharedCacheHeaders(…)`, a
   resource by returning `withSharedCache(response, …)`.
2. **Shared means anonymous.** A session or language cookie makes a request
   _personal_: its response is rendered for that visitor and never stored.
   Vercel will not key its cache on `Cookie` (a response with `Vary: Cookie`
   is not cached at all), so the CDN routes in
   [`src/lib/personal-cache-key.ts`](src/lib/personal-cache-key.ts) send
   personal requests to their own URL (`?__personal=1`, stripped in
   `server.ts`). A redirect, an error or a write is never shared either.
3. **A shared response lives until it expires or its tag is purged.** A
   deploy starts an empty cache, because Vercel keys it per deployment.
   Browsers ask the CDN every time.

| What                                | Same for                                           | Until                                                     |
| ----------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| A baby's page and its overlays      | every anonymous visitor                            | its data changes, or its day ends                         |
| A baby's manifest                   | everyone                                           | its data changes, or its day ends                         |
| A baby's share image (`/og/baby/…`) | everyone                                           | never: the URL names its content, so browsers keep it too |
| Homepage, login, signup, `/og`      | anonymous visitors with the same `Accept-Language` | the next deploy                                           |
| `/og/preview`                       | anonymous visitors with the same `Accept-Language` | a day                                                     |
| `robots.txt`                        | everyone                                           | the next deploy                                           |
| `sitemap.xml`                       | everyone                                           | a day                                                     |
| Everything else                     | nobody                                             |                                                           |

**A baby's data changes:** every shared response about a baby carries the tag
`baby:<id>`. The Convex triggers in
[`triggers.ts`](../backend/convex/triggers.ts) purge it on any write to what
the public page reads (the baby, its feed, its owner's language and time zone),
through a durable job that calls `/api/cache/purge` here
([`cacheInvalidation.ts`](../backend/convex/cacheInvalidation.ts)). A mutation
that writes those tables must be a `mutationWithTriggers`. A migration is not,
so a page it changes stays as it was until the day ends or the next deploy.

**A baby's day ends:** at midnight in the baby's time zone the countdown
moves on, and so does the day in the share image's URL.

**Shared HTML must be the same for everyone it is shared with.** A baby page
is in the baby's language, so nothing in it may come from the visitor's. Text
that ages ("5 minutes ago", the countdown) reads the clock from
[`useNow`](src/lib/use-now.tsx): the browser hydrates at the moment the
server rendered, whenever that was, and then moves to its own clock.

To check a deployment, request a page twice without cookies and look for
`x-vercel-cache: HIT` on the second response.

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

Set `VITE_SENTRY_DSN` to the `personal-isbabyoutyet` DSN and `SENTRY_AUTH_TOKEN`
so production builds upload source maps. Convex reports uncaught errors to that
same project. Turn that on per deployment under Settings → Integrations, and
tag them `runtime: "convex"`. See
[`packages/sentry`](../../../packages/sentry/README.md).
