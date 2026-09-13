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
the browser `Accept-Language` header (custom Paraglide strategy), then from the
locale cookie once the visitor chooses a language. Explicit `?unit=c` / `?unit=f`
always wins and is retained across in-app navigations.

## Deploy (Vercel)

Create a **separate** Vercel project for this app (do not reuse the baby-outlet
project’s Root Directory).

| Setting | Value |
| --- | --- |
| Root Directory | `projects/sous-vide-guide/web` |
| Framework Preset | Other |
| Install Command | from `vercel.json`: `cd ../../.. && pnpm install` |
| Build Command | from `vercel.json`: `pnpm build` |
| Output Directory | from `vercel.json`: `.output/public` |

Nitro builds with `preset: "vercel"` (`vite.config.ts`). Preview and production
deployments are the normal Vercel Git integration for that project.

No Convex backend — this is a static/SSR front-end only.

## Content

Sous vide temperatures and times are adapted from
[KitchenLab’s köksguide #9](https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/)
(source attribution only — this app is a separate guide browser).
