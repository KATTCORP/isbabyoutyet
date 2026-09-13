# Sous Vide Guide

Browsable sous vide temperatures and cook times — searchable, translated, and
linkable.

## Apps

- `web/` — `@sous-vide-guide/web`, a TanStack Start application with Paraglide
  (`sv`, `en-GB`, `en-US`)

## Develop

```bash
pnpm --filter @sous-vide-guide/web dev
```

Runs on [http://localhost:3002](http://localhost:3002).

## Temperature unit default

When `unit` is missing from the URL, the guide picks **°F** for US locales
(`en-US` and other `*-US` tags) and **°C** otherwise. The app locale comes from
the Paraglide cookie once the visitor chooses a language, otherwise from the
browser `Accept-Language` header (custom strategy in
`src/lib/locale-strategy.ts`). Explicit `?unit=c` / `?unit=f` always wins. The
°C/°F control lives in the sticky header; changing language also applies that
locale’s default unit (with a toast when the unit flips).

## Browsing

`/` renders one card per cut: doneness variants (rare → medium → well done)
collapse into a ladder inside the card (`src/lib/group-cuts.ts`), so 76 rows
read as about 30 ingredients. Categories are **in-page anchors** (not filters)
in a quick-link dock: fixed to the bottom of the screen on phones (thumb reach,
above the home indicator), a sticky row under the search field on wider
screens. While a search is active the dock shows the result count instead.
Search updates `?q=` as you type (replace navigation); the field is
uncontrolled so focus and cursor never move, and filtering is deferred so the
input stays responsive. Permalinks use `#category` and `#entry-id` with smooth
scrolling and sticky-header offset.

## Content database

Rows live in `web/src/data/sousVide.ts` as `getSousVideEntries(t)`. Numbers and
ids are code; display names, doneness, and search aliases go through
`createContentT` (English literals as message keys in
`web/messages/{en-GB,en-US,sv}.json`). UI chrome uses Paraglide `m.*` separately.

## Deploy (Vercel)

Create a **new** Vercel project for this app. Do not change the Is Baby Out Yet
project’s Root Directory to point here.

| Setting | Value |
| --- | --- |
| Framework Preset | TanStack Start |
| Root Directory | `projects/sous-vide-guide/web` |
| Include source files outside of the Root Directory | **On** |
| Install Command | `cd ../../.. && pnpm install` (or Project Settings / `vercel.json`) |
| Build Command | `pnpm build` |
| Output Directory | leave empty (Nitro `preset: "vercel"`) |
| Environment Variables | none required |

## Content

Sous vide temperatures and times are adapted from
[KitchenLab’s köksguide #9](https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/)
(source attribution only — this app is a separate guide browser).
