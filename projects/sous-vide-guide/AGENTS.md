# Sous Vide Guide — agent notes

Web-only product under `projects/sous-vide-guide/web` (`@sous-vide-guide/web`).

## UX contracts

- **Temperature unit** lives in the sticky header (`?unit=c|f`). Locale default is
  °F for `*-US`, otherwise °C (`defaultTemperatureUnit`).
- **Language** is a compact dropdown (region codes GB / US / SE, no emoji flags).
  Changing language also applies that locale’s default unit; when the unit
  flips, stash `UNIT_CHANGE_TOAST_KEY` before Paraglide’s reload so
  `useUnitChangeToast` can toast after navigation.
- **Categories** are in-page `#anchor` links only (not URL filters). Sections use
  `scroll-mt-*`; `html { scroll-behavior: smooth }` is in `src/styles/app.css`.
- **Search** writes `?q=` on every change; the page filters with
  `useDeferredValue` so typing stays responsive.

## Content seam

Guide row strings use English (en-GB) literals as keys via `createContentT` in
`src/lib/content-t.ts` — same idea as the baby app’s content `t("Literal")`.
UI chrome stays on Paraglide `m.*`. Do not chase further `t('literal')` churn;
the current seam is enough.

## Deploy

New Vercel project. Root Directory: `projects/sous-vide-guide/web`. Do not point
the Is Baby Out Yet Vercel project here.
