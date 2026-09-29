# `@sous-vide-guide/web`

TanStack Start app with Paraglide (`sv`, `en-GB`, `en-US`). The rules shared by
every web app are in [`projects/`](../../README.md).

Run `pnpm dev-sous` from the repo root to serve it at
[localhost:3002](http://localhost:3002).

## Content

Rows live in `src/data/sousVide.ts` (`getSousVideEntries(t)`). Numbers and ids
are code. Names, doneness, and search aliases go through `createContentT`
(`src/lib/content-t.ts`), with English literals as keys in
`messages/{en-GB,en-US,sv}.json`. UI chrome uses Paraglide `m.*`. Keep doneness
steps coldest-first, because the per-cut ladder (`src/lib/group-cuts.ts`)
renders them in source order. Detail-sheet notes, including safety notes, and
their sources live in `src/data/cutGuide.ts`.

## UX contracts

- **Header** is sticky and holds color mode (`@workspace/ui` `ModeToggle`, via
  `next-themes` in `__root.tsx`), the °C/°F toggle, and the language dropdown
  (region codes GB / US / SE, no emoji flags). Dark tokens are in
  `src/styles/app.css`.
- **Pinned bars** (site header, category dock, sticky category titles) all use
  opaque `bg-background` with no `backdrop-blur`, so they look the same and
  content never shows through.
- **Unit:** an explicit `?unit=c|f` always wins. Otherwise the default is °F
  for `*-US` locales and °C elsewhere (`defaultTemperatureUnit`).
  `unitSearchMiddleware` removes `?unit=` when it matches the locale default.
  The locale comes from the Paraglide cookie, falling back to
  `Accept-Language` (`src/lib/locale-strategy.ts`). Changing language applies
  that locale's default unit: the switcher shows a toast when the unit flips,
  and `setLocaleInPlace` persists the locale without a reload. Unit and
  language switches keep the scroll position.
- **More info drawer:** the URL hash alone controls it (`#info-<cutId>`, via
  `src/lib/info-hash.ts`), so a shared link scrolls to the card. Opening and
  closing navigate with `replace: true`, `resetScroll: false`, and
  `hashScrollIntoView: false`, and closing clears the hash. Legacy
  `?info=<cutId>` links redirect to the hash form in the index route.
- **Search** writes `?q=` with `replace: true` and `resetScroll: false`. The
  input is uncontrolled (`defaultValue`, never re-keyed) so focus survives
  navigation, and filtering runs through `useDeferredValue`.
- **Categories** are in-page `#anchor` links, not filters, and there is no
  "All" chip. They sit in a dock that is `position: fixed` at the bottom on
  phones and a sticky row on `sm+`. Keep the dock out of any ancestor with
  `backdrop-filter` or `transform`, and keep `main`'s bottom padding. While
  searching, the dock shows the result count instead.
- **Scroll offsets:** `--sticky-chrome-h` in `src/styles/app.css` is
  everything pinned up top: `--site-header-h`, plus `--category-dock-h` on
  `sm+` (the dock's height is set from it too). A section's `scroll-mt` and its
  title's sticky `top` are both `calc(var(--sticky-chrome-h) - 1px)`, and the
  title is the section's first box (spacing between sections is `mt-*`, never
  `pt-*`), so a `#category` jump lands the title flush under the chrome. The
  1px overlap closes a mobile compositor page-bg slit under the site header.
  The active-section spy (`useActiveSection`, the one audited hook
  seam here) reads the same `scroll-margin-top`, so changing it moves both.
- **Category links** (dock chips and title permalinks) are plain
  `<a href="#…">`: native fragment navigation re-scrolls even when the hash is
  already in the URL, where a router `Link` to the current URL does nothing.
  CSS `scroll-behavior: smooth` animates them. `aria-current="location"` comes
  from the router's `location.hash`, which the router updates on `popstate`.
  Cut permalinks and `navigate({ hash })` go through the router, whose
  `defaultHashScrollIntoView` in `src/router.tsx` passes explicit options
  (iOS Safari needs them).
- **Layout:** one column of cards at every width, inside `max-w-3xl`.

## Deploy (Vercel)

This app has its own Vercel project; do not repoint the Is Baby Out Yet
project. [`vercel.json`](vercel.json) sets the framework, install command,
and build command. In the dashboard, set Root Directory to
`projects/sous-vide-guide/web`, turn on "include source files outside Root
Directory", and leave the output directory empty. No env vars are needed.
