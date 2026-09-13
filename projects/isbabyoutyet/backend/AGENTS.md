<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

For **schema changes on deployed apps** (remove fields, tighten validators,
stacked migration PRs), read
[`.agents/skills/convex-schema-migration/SKILL.md`](.agents/skills/convex-schema-migration/SKILL.md)
before editing `schema.ts` or `migrations.ts`.

`v.optional()` on schema fields and RPC args is a migration transient only.
Undocumented optionals fail `workspace/no-undocumented-optional`;
mark remaining optionals with JSDoc `@todo` (they are still in use), then
backfill and require the key. Sparse `ctx.db.patch` RPCs named `update` or
`patch*` with `{ id, patch }` (same shape as `baby.update`) are a permanent
exception — `id` is `v.id(...)` or a composite `v.object` of two or more
`v.id(...)` fields; `patch` is all `v.optional()`. Omitted keys mean unchanged. See
[`.agents/skills/convex-schema-migration/SKILL.md`](.agents/skills/convex-schema-migration/SKILL.md).

## Demo seed

Preview and local backends share `seed:seedDemoData` (login + babies in every
status, plus `test+newuser@example.com` with no babies and
`test+coparent@example.com` as a co-parent on Milo; `/baby/milo` is kept as a
historical slug that canonicalizes to `/baby/baby-born`) plus
`homepageDemo:refresh` once per locale (the public live-demo pages
linked from the homepage). Those babies are stored with `demo: true`; the
refresh mutation also requires a reserved homepage publicId plus the sentinel
owner user/token, and only grandfathers the existing pre-flag Juniper Hale row.
Resetting deletes only those babies' feed documents and never deletes storage
objects, whose IDs may be reused by non-demo data. Local `setup-dev` seeds fixture
text first (`seed:data`); sharp resize + photo uploads run in the background
after `pnpm dev` starts (`dev:seed-photos-deferred`). Production deploys run
`seed:homepage` in the Vercel build (idempotent: a complete fixture feed is
the photo sentinel). Preview deploys reuse the branch Convex backend unless
`schema.ts` / `convex.config.ts` changed; a wipe reseeds demo login + fixture
text in the Vercel build, and homepage photos upload from GitHub Actions after
Vercel is Ready (`seed-preview.yml`). `crons.ts` checks daily and resets every
locale independently when that baby has no real visitor encouragement from the
previous hour.
When opening PRs, follow the root
[`AGENTS.md`](../../../AGENTS.md) and link each seeded baby on the Vercel preview.
