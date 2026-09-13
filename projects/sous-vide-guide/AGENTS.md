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
  chip. The search field scrolls with the page; only the site header (and the
  quick-link dock) stays pinned. Sections use `scroll-mt-*` against
  `--site-header-h` (fixed header height, see `src/styles/app.css`, which also
  sets `html { scroll-behavior: smooth }`) plus the dock row height on `sm+`.
- **Search** writes `?q=` on every change with `replace: true`; the input is
  uncontrolled (`defaultValue`, never re-keyed) so focus and cursor survive the
  navigation, and the Clear button resets the field imperatively. Scroll is
  never reset (`resetScroll: false`): results render right under the field the
  user is typing in. The page filters with
  `useDeferredValue` so typing stays responsive. While a query is active the
  dock shows the result count instead of the category links.
- **Grouping**: rows are shown per cut via `groupSousVideEntriesByCut`
  (`src/lib/group-cuts.ts`); doneness steps must stay coldest-first in
  `src/data/sousVide.ts` because the ladder renders them in source order.
- **Bottom dock** (`CategoryDock`) is `position: fixed` on phones — keep it out
  of any ancestor with `backdrop-filter`/`transform`, and keep `main`'s bottom
  padding so the footer clears it. The links are one segmented button group;
  the current section is highlighted by `useActiveSection`
  (`src/lib/use-active-section.ts`, the one audited hook seam here): a section
  is "reached" once its top passes its own `scroll-margin-top`, so the spy and
  `#hash` jumps agree — change `scroll-mt-*` on `CategorySectionView` and the
  spy follows. TanStack `Link` owns `aria-current`; quick links use
  `activeOptions={{ exact: true, includeHash: true }}` so only the URL-hash
  match announces as current.
- **One column** of cards at every width; `main` stays `max-w-3xl`.

## Content seam

Guide row strings use English (en-GB) literals as keys via `createContentT` in
`src/lib/content-t.ts` — same idea as the baby app’s content `t("Literal")`.
UI chrome stays on Paraglide `m.*`. Do not chase further `t('literal')` churn;
the current seam is enough.

## Deploy

New Vercel project. Root Directory: `projects/sous-vide-guide/web`. Do not point
the Is Baby Out Yet Vercel project here.
