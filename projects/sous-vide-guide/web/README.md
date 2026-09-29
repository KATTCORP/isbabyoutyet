# `@sous-vide-guide/web`

TanStack Start app with Paraglide (`sv`, `en-GB`, `en-US`). The rules shared by
every web app are in [`projects/`](../../README.md).

```sh
pnpm --filter @sous-vide-guide/web dev   # http://localhost:3002
```

## Content

Rows live in `src/data/sousVide.ts` (`getSousVideEntries(t)`). Numbers and ids
are code. Names, doneness, and search aliases go through `createContentT`
(`src/lib/content-t.ts`), with English literals as keys in
`messages/{en-GB,en-US,sv}.json`. UI chrome uses Paraglide `m.*`. Keep doneness
steps coldest-first, because the per-cut ladder (`src/lib/group-cuts.ts`)
renders them in source order.

## UX contracts

- **Header** is sticky and holds color mode (`@workspace/ui` `ModeToggle`, via
  `next-themes` in `__root.tsx`), the °C/°F toggle, and the language dropdown
  (region codes GB / US / SE, no emoji flags). Dark tokens are in
  `src/styles/app.css`.
- **Unit:** an explicit `?unit=c|f` always wins. Otherwise the default is °F
  for `*-US` locales and °C elsewhere (`defaultTemperatureUnit`). The locale
  comes from the Paraglide cookie, falling back to `Accept-Language`
  (`src/lib/locale-strategy.ts`). Changing language applies that locale's
  default unit: the switcher handler shows a toast when the unit flips, and
  `setLocaleInPlace` persists the locale without a reload.
- **Search** writes `?q=` with `replace: true` and `resetScroll: false`. The
  input is uncontrolled (`defaultValue`, never re-keyed) so focus survives
  navigation, and filtering runs through `useDeferredValue`.
- **Categories** are in-page `#anchor` links, not filters, and there is no
  "All" chip. They sit in a dock that is `position: fixed` at the bottom on
  phones and a sticky row on `sm+`. Keep the dock out of any ancestor with
  `backdrop-filter` or `transform`, and keep `main`'s bottom padding. While
  searching, the dock shows the result count instead.
- **Scroll offsets:** sections use `scroll-mt-*` against `--site-header-h`
  (plus the dock row on `sm+`). The active-section spy (`useActiveSection`,
  the one audited hook seam here) reads the same `scroll-margin-top`, so
  changing `scroll-mt-*` on `CategorySectionView` moves both. Smooth `#hash`
  jumps come from `defaultHashScrollIntoView` in `src/router.tsx`; iOS Safari
  needs the explicit options. Quick links use
  `activeOptions={{ exact: true, includeHash: true }}` for `aria-current`.
- **Layout:** one column of cards at every width, inside `max-w-3xl`.

## Deploy (Vercel)

This app has its own Vercel project; do not repoint the Is Baby Out Yet
project. [`vercel.json`](vercel.json) sets the framework, install command,
and build command. In the dashboard, set Root Directory to
`projects/sous-vide-guide/web`, turn on "include source files outside Root
Directory", and leave the output directory empty. No env vars are needed.
