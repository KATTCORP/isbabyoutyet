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
  chip. Sections use `scroll-mt-*` against `--site-header-h` (fixed header
  height, see `src/styles/app.css`, which also sets
  `html { scroll-behavior: smooth }`).
- **Search** writes `?q=` on every change with `replace: true`; the input is
  uncontrolled (`defaultValue`, never re-keyed) so focus and cursor survive the
  navigation, and the Clear button resets the field imperatively. Scroll is
  kept while refining (`resetScroll: false`) and reset once when a query starts
  so results land under the sticky toolbar. The page filters with
  `useDeferredValue` so typing stays responsive. Category tiles hide while a
  query is active (results are one ranked card grid, not sections).
- **Colour** encodes temperature: use `temperatureSwatch` / `thermalGradient`
  from `src/lib/temperature-color.ts` rather than ad-hoc colours per category.
- **Cut grouping**: cards render under one caption per cut via
  `groupSousVideEntriesByCut` (`src/lib/group-cuts.ts`); the caption carries the
  name and `#cutId` anchor, each card carries one doneness step. Keep doneness
  rows coldest-first in `src/data/sousVide.ts`.

## Content seam

Guide row strings use English (en-GB) literals as keys via `createContentT` in
`src/lib/content-t.ts` — same idea as the baby app’s content `t("Literal")`.
UI chrome stays on Paraglide `m.*`. Do not chase further `t('literal')` churn;
the current seam is enough.

## Deploy

New Vercel project. Root Directory: `projects/sous-vide-guide/web`. Do not point
the Is Baby Out Yet Vercel project here.
