<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# `@isbabyoutyet/backend`

Convex schema, functions, migrations, and demo seed for
[Is Baby Out Yet?](../README.md). `AGENTS.md` and `CLAUDE.md` are symlinks to
this file, and `npx convex ai-files install` rewrites only the marked block
at the top. Convex skills live in `.agents/skills/`, next to this project, so
refreshing them overwrites the right tree.

## Schema changes

Before editing `schema.ts` or `migrations.ts` on a deployed app, read
[`convex-schema-migration`](.agents/skills/convex-schema-migration/SKILL.md).

`v.optional()` is allowed only as a migration transient
(`workspace/no-undocumented-optional`): mark it with a JSDoc `@todo`, backfill,
then require the key. The permanent exception is sparse-patch RPCs named
`update` / `patch*` that take `{ id, patch }`, where every `patch` field is
`v.optional()` and an omitted key means unchanged.

## Demo seed

`seed:seedDemoData` creates the [demo logins](../README.md#demo-logins) and
their babies. `homepageDemo:refresh` creates one public demo baby per locale,
linked from the homepage. The source of truth is
[`src/seedCredentials.ts`](src/seedCredentials.ts).

- Demo babies have `demo: true`. Resetting deletes only their feed documents,
  never storage objects, because storage IDs may be shared with real data.
- Locally, `setup-dev` seeds the demo logins. `pnpm dev` seeds the homepage
  demo (text, then photos) through
  [`convex dev --start`](https://docs.convex.dev/cli/reference/dev) once the
  first push lands, so uploads reach a backend that stays up. Once the demo
  is complete, later runs only check for it. A failed seed only prints a
  warning. Retry with `pnpm seed:homepage` while `pnpm dev` runs.
- [`scripts/deployVercel.ts`](scripts/deployVercel.ts) is the Vercel build
  command: it deploys Convex, then builds the web app while it sets the
  runtime env, runs migrations, and seeds the homepage demo (text and
  photos) on production and previews alike. A complete demo is left alone; a
  failed photo upload only warns, and the next deploy retries it.
- Previews reuse the branch backend unless `schema.ts` / `convex.config.ts`
  changed; a wipe gets the demo logins and the whole homepage demo again.
- `crons.ts` resets each locale's homepage baby daily, unless it received real
  visitor encouragement in the previous hour.

PRs that touch seeded data should link each seeded baby on the Vercel preview.
