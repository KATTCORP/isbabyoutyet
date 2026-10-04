<!--
Stack: include only for stacked PRs. Add ## Stack at the top. The first PR gets
a two-column table (PR | Description) of the whole stack; later PRs get a short
bullet list linking the first PR and the PR they build on (see the
create-stacked-prs skill). Title suffix is (n/N). Current row: bold + 👉 in the
PR column. PR cells are markdown links, e.g.
`[#123](https://github.com/KATTCORP/isbabyoutyet/pull/123) 1/N` (canonical
KATTCORP owner). Link every PR you mention elsewhere in the body the same way:
no bare `#123` and no `KATTCORP/isbabyoutyet#123` shorthand.
If merge batches differ, split into ### subheadings (one table per batch) and
put merge-when in the heading. Omit this entire section if this PR is not part
of a stack — do not write n/a.
-->

## Why

-

## How

-

## What

-

## Alternate approaches considered

-

## Schema changes

<!--
If schema.ts (or related schema files) and migrations did not change, write None.
Otherwise bullets for:
- Schema: tables/fields/indexes/unions; additive vs breaking vs required-field
- Why / motivation
- Migrations: what ran/will run (e.g. projects/isbabyoutyet/backend/convex/migrations.ts or
  migration functions); backfill vs require-after-backfill; follow-up PRs that
  tighten validators or drop old fields
- If this continues schema/migration work from an earlier PR, link it and say
  what this slice does vs landed vs TODO
-->

None

## Screenshots / video

<!--
Required for every PR.
- User-visible UI changes: attach the smallest useful set of screenshots from
  the final tested preview. Include before/after only when the final state does
  not make the difference clear.
- Interactions, animations, or multi-step flows: also attach a short, focused
  video of the successful flow.
- Do not include failed runs, setup steps, stale UI, redundant captures, or
  sensitive data.
- Non-visual changes: write `None — <brief reason>`.
-->

None

## Test plan

- [ ]
