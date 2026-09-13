---
name: convex-schema-migration
description: >-
  Plan and execute safe Convex schema migrations on deployed apps using this
  repo's three-phase pattern, stacked PRs, and migrations.ts conventions. Use
  when removing fields or enum values, tightening validators, or fixing deploy
  failures after schema changes.
---

# Convex schema migration (this repo)

Safe migrations on a **live** Convex deployment. Read
[`convex-migrate`](../convex-migrate/SKILL.md) for the generic `@convex-dev/migrations`
basics; this skill covers **this project's** workflow and deploy ordering.

Do **not** edit [`convex-migrate`](../convex-migrate/SKILL.md) or other
`npx convex ai-files` skills — those are maintained by Convex.

## Critical deploy order

On `convex deploy`, Convex **validates every existing document against the new schema before any migration runs**. A tightened validator that rejects legacy rows will fail deploy even if a backfill migration is registered.

Never combine "write missing keys / strip legacy values" and "make the field required / drop the field" in the same deploy.

## JSDoc on `v.optional()`

`workspace/no-undocumented-optional` rejects undocumented `v.optional()`.

Prefer **`@todo`**: the optional is still in use; remaining work is to require the key.

Permanent exceptions (not a follow-up to require the key):

- `migrations.runAll` runner args: keep `@todo Keep mirroring @convex-dev/migrations runner options`.
- Sparse `ctx.db.patch` RPCs named `update` or `patch*` whose `args` are `{ id, patch }` (same shape as `baby.update`). `id` is `v.id(...)` or `v.object` of two or more `v.id(...)` fields; `patch` is `v.object` of `v.optional()` fields. Omitted keys mean unchanged. No `@todo` / `oxlint-disable`.

```typescript
/** @todo Optional until every row sets this key. */
theme: v.optional(v.union(v.string(), v.null())),
```

`@deprecated` also satisfies the lint. Use it only when the optional itself is a deprecated API, not for fields callers still send.

`convex.config.ts` env validators are exempt.

## Adding a required field (or banning omit-key)

Callers and rows must set the key (`null` / `false` / a concrete value). Stack this so each deploy stays valid:

| Phase                 | Schema                                                                         | RPC args                                                                                  | Migration                                                                                                                                                                  | Stack PR                  |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **1. Document**       | Keep `v.optional(...)` + `@todo`                                               | Keep `v.optional(...)` + `@todo`                                                          | None                                                                                                                                                                       | **1/N** lint/docs         |
| **2. Require RPC**    | Still optional (rows may omit the key)                                         | `v.union(..., v.null())` or a concrete validator; callers pass `null` instead of omitting | None                                                                                                                                                                       | **2/N**                   |
| **3. Backfill**       | Still optional. Widen with `v.union(..., v.null())` if RPC now persists `null` | Already required                                                                          | Idempotent walkers write missing keys (`undefined` only; do not clobber set values). Register on `runTableMigrations` **and** `TABLE_MIGRATION_NAMES` (`deploymentStatus`) | **3/N** — separate deploy |
| **4. Require schema** | Drop `v.optional()`                                                            | Already required                                                                          | No new migration. Deploy only after `deploymentStatus` is done on the target backend                                                                                       | **4/N** — separate deploy |

Skip phase 2 when the key is schema-only (no RPC arg). Skip phase 3 when every row already has the key (prove it in tests).

**Do not merge/deploy phase 4 until phase 3 has finished on that backend.** Convex would reject omitted keys before the backfill runs.

Leave `migrations.runAll` runner args optional (`@todo Keep mirroring @convex-dev/migrations runner options`).

Leave `update` / `patch*` sparse patch args optional (`{ id, patch }` with all-partial `patch`). Skip phase 2 for those mutations: omitted keys mean unchanged and map to `ctx.db.patch`.

## Removing fields or enum values

| Phase                      | Action                                 | Schema                                                                | Migration                                                                                                                                                                                                       | Stack PR                         |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **1. Tolerate + optional** | Keep validator tolerant of legacy data | Re-add retired enum literal or make field `v.optional(...)` + `@todo` | None yet, or register the strip migration in the same PR                                                                                                                                                        | **1/N**                          |
| **2. Strip**               | Remove legacy data from all rows       | Same permissive schema as phase 1                                     | `migrateOne` deletes the field / filters enum from arrays; register in `runTableMigrations` + `TABLE_MIGRATION_NAMES` (add `HISTORICAL_MIGRATION_NAMES` only when seed/deploy must wait on this walker forever) | **1/N** (same deploy as phase 1) |
| **3. Remove**              | Tighten schema and delete dead code    | Drop field from `schema.ts` / remove enum literal                     | Migration already ran; no new migration                                                                                                                                                                         | **2/N**                          |

## Stacked PRs (required for breaking changes)

Use [`.agents/skills/create-stacked-prs/SKILL.md`](../../../../.agents/skills/create-stacked-prs/SKILL.md).

- **PR 1/N:** Permissive schema + `@todo` on remaining optionals (+ RPC require, if that is a separate slice).
- **Backfill PR:** Migrations that write or strip data. One deploy runs them via `runAll`.
- **Final PR:** Require the key or drop the field **after** the backfill deploy has finished.

Do not combine the tighten/remove PR with the backfill PR.

## Repo conventions (`projects/isbabyoutyet/backend/convex/migrations.ts`)

### Define migrations

```typescript
export async function removeLegacyFieldDoc(ctx: MutationCtx, doc: Doc<"table">) {
  if (doc.legacyField === undefined) return;
  const { legacyField: _removed, ...rest } = doc;
  await ctx.db.replace("table", doc._id, rest);
}

export const removeLegacyField = migrations.define({
  table: "table",
  migrateOne: removeLegacyFieldDoc,
});
```

For omitted keys, patch only `undefined` properties (do not overwrite stored `null` / `false` / values). For enum values in arrays, filter to the current allowed set in `migrateOne`.

### Register runners

1. Add to the `runTableMigrations` array (runs on every deploy via `runAll`).
2. Add the function name to `TABLE_MIGRATION_NAMES` so `deploymentStatus` waits on it (preview seed uses this gate).
3. Add to `HISTORICAL_MIGRATION_NAMES` only when a later deploy is unsafe until this walker has finished on every existing backend (the older seed/deploy subset).

### Deprecate in validators, not only schema

Union literals and table fields both participate in deploy validation. When removing an enum value or field, keep the validator/schema tolerant until the strip migration has run.

### Tests

Add convex-test coverage in `migrations.test.ts`: insert a doc with the legacy/sparse shape, run `migrateOne` (or `runTableMigrations`), assert clean state and idempotency. After the schema is required, sparse inserts are impossible — keep missing-key coverage on the backfill PR, and test idempotency on complete docs in the tighten PR.

## Checklist

```
Add required field:
- [ ] Phase 1: `@todo` on remaining `v.optional()` (lint)
- [ ] Phase 2: RPC args required (`null` or concrete); callers updated
- [ ] Phase 3: backfill missing keys; `deploymentStatus` lists the walkers
- [ ] Deploy phase 3; wait until deploymentStatus is done
- [ ] Phase 4: drop `v.optional()` from schema; always write keys on insert
- [ ] pnpm checks

Removal:
- [ ] Phase 1: validator/schema still accepts legacy rows (`v.optional` + `@todo`)
- [ ] Phase 2: idempotent migration in runTableMigrations (+ TABLE_MIGRATION_NAMES)
- [ ] Test in migrations.test.ts
- [ ] PR 1/N: permissive schema + migration + deploy
- [ ] Verify deploy + migration status
- [ ] Phase 3 / follow-up PR: remove the field or enum literal
- [ ] pnpm checks
```

## Pattern examples

| Change                                | First PR(s)                                                | Last PR                                        |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Require a schema field that rows omit | `@todo` + backfill missing keys to `null`/`false`          | Drop `v.optional()`                            |
| Require an RPC arg callers omit       | `@todo` then `v.union(..., v.null())`; callers pass `null` | (schema PR only if the column is optional too) |
| Remove optional boolean flag          | Keep `v.optional(...)` + strip migration                   | Drop field from `schema.ts`                    |
| Remove enum literal from union        | Keep literal + `@todo` + filter migration                  | Drop literal from validator                    |

## References

- Generic migrate skill (Convex-maintained, do not edit): [`convex-migrate`](../convex-migrate/SKILL.md)
- Rehearse on preview: [`convex-migrate-rehearse`](../convex-migrate-rehearse/SKILL.md)
- Package agent notes: [`AGENTS.md`](../../AGENTS.md)
