# Sous Vide Guide — agent notes

Web-only product under `projects/sous-vide-guide/web` (`@sous-vide-guide/web`).

## UX contracts

- **Temperature unit** lives in the sticky header (`?unit=c|f`). Locale default is
  °F for `*-US`, otherwise °C (`defaultTemperatureUnit`).
- **Language** is a compact dropdown (region codes GB / US / SE, no emoji flags).
  Changing language also applies that locale’s default unit. When the unit
  flips, toast from the switcher handler (no post-reload hook) and persist the
  locale with `setLocaleInPlace` so the page can navigate/`?unit=` without a
  full reload.
- **Categories** are in-page `#anchor` links only (not URL filters) — no “All”
  chip. Search and jump chips scroll with the page; only the site header is
  sticky. Sections use `scroll-mt-*`; `html { scroll-behavior: smooth }` is in
  `src/styles/app.css`. Keep category sections while filtering so layout does
  not jump when the result set changes.
- **Search** writes `?q=` on every change with a controlled input
  (`resetScroll: false`, no remount `key`). The page filters with
  `useDeferredValue` so typing stays responsive without stealing focus.

## Content seam

Guide row strings use English (en-GB) literals as keys via `createContentT` in
`src/lib/content-t.ts` — same idea as the baby app’s content `t("Literal")`.
UI chrome stays on Paraglide `m.*`. Do not chase further `t('literal')` churn;
the current seam is enough.

## PWA

The guide is installable: `public/manifest.webmanifest` plus a thin `public/sw.js`
registered from `src/lib/register-service-worker.ts` (side-effect import in the
root route). Keep install icons square (`android-chrome-192x192.png` /
`android-chrome-512x512.png`) so Android can mask them.

## Deploy

New Vercel project. Root Directory: `projects/sous-vide-guide/web`. Do not point
the Is Baby Out Yet Vercel project here.
