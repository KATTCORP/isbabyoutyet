---
name: create-stacked-prs
description: >-
  Create and update stacked GitHub pull requests with a full-stack table at
  the top of every PR and titles suffixed (n/total). Use when the user asks
  for stacked PRs, a stack of PRs, create stacked PRs, stacking PRs, stacked
  pull requests, or to open dependent PRs in sequence.
---

# Create Stacked PRs

Open a sequence of dependent PRs. Each PR targets the previous PR's branch (except the first, which targets `main`). Keep commits and PRs small and sequential.

Fill `.github/pull_request_template.md` for PR bodies. Stacked PRs add `## Stack` at the top; non-stack PRs omit that section entirely (never `n/a`). Bodies use titled `##` sections (`Why`, `How`, `What`, `Alternate approaches considered`, `Schema changes`, `Screenshots / video`, `Test plan`) with concise bullets — not a single Summary with labeled bullets.

## When to use

Do **not** create stacked PRs unless the user asked for a stack or the work is clearly a stack (dependent sequential slices, for example an additive backfill that must land before a required-schema change). Independent slices go onto `main` as separate PRs. If unsure, ask.

## Hard rules

- Use `gh` for all GitHub tasks. Never update git config. Never skip hooks.
- Push is required when creating stacked PRs (`git push -u origin HEAD` per branch).
- Never force-push `main`. Never force-push any branch unless you are updating a stack branch after a rebase; then use `--force-with-lease` on that stack branch only.
- The first PR is `1/N`. The last is `N/N`.
- Every PR in the stack must be independently reviewable as much as possible.
- Repeat the **full** stack table at the **top** of **every** PR body, not only the bottom PR.
- Draft vs ready: follow the user. Add `--draft` only when they ask for drafts. Otherwise create ready PRs.
- Do not put a demo-seed checklist in the PR body unless the user asks for one.

## Title

```
{imperative title} ({n}/{total})
```

Examples from this repo: `Backfill due date display mode (1/2)`, `Require exact-date or custom-message display (2/2)`.

The suffix is `(1/2)` in parentheses, never a bare `1/2`.

## PR body

Fill `.github/pull_request_template.md`. Do not duplicate the template here.

- **Stacked PRs:** `## Stack` first, with the full two-column table (PR | Description). Mark the current PR in the PR column as `**👉 …**` (bold plus emoji). Do not use `← this PR` in Description. Then follow the rest of `.github/pull_request_template.md`.
- **Non-stack PRs:** omit the Stack section entirely. Do not write `n/a`.
- **Why / How / What / Alternate approaches considered:** titled `##` sections with concise bullets under each. Do not use a single Summary with labeled `Why:` bullets. See `.github/pull_request_template.md` (do not duplicate it here).
- **Schema changes** is required and covers schema **and** related Convex migrations (for example `projects/baby-outlet/backend/convex/migrations.ts` or migration functions). If neither changed, write `None`. If either did, fill the schema, why, migrations, and follow-up bullets in `.github/pull_request_template.md` (do not duplicate them here).
- **Screenshots / video** is required. Follow the root `AGENTS.md`: attach final-preview screenshots for UI changes and a short video for interactions; otherwise write `None — <brief reason>`.

## Stack table

Put this table at the **top** of every stacked PR description, under `## Stack`. Columns are only **PR** and **Description**. Omit this section on non-stack PRs.

```markdown
| PR | Description |
| --- | --- |
| #123 1/3 | Backfill existing data |
| **👉 #124 2/3** | Add the UI |
| #125 3/3 | Follow-up cleanup |
```

Use the actual PR numbers once known. Before numbers exist, still put the table at the top (use `(1/3)` in the PR cell) and update after `gh pr create`.

Mark the current PR in the **PR** column only: bold the cell and prefix `👉`. Do not add a third column. Do not put `← this PR` in Description.

```markdown
| PR | Description |
| --- | --- |
| [#123](https://github.com/KATT/isbabyoutyet/pull/123) 1/3 | Backfill existing data |
| **👉 [#124](https://github.com/KATT/isbabyoutyet/pull/124) 2/3** | Add the UI |
| [#125](https://github.com/KATT/isbabyoutyet/pull/125) 3/3 | Follow-up cleanup |
```

After creating all PRs, edit earlier PR bodies so every table has real numbers and links for the whole stack.

## Plan the stack

1. List sequential slices. Each slice should review on its own as much as possible. Foundations before consumers.
2. Name branches so the order is obvious (`feature/foo-1-backfill`, `feature/foo-2-ui`).
3. Confirm `N` (total) before opening PRs. Renumber titles and the table if `N` changes.
4. Gather git state in parallel before the first push: `git status`, `git diff`, `git log` / `git diff main...HEAD`, and whether the current branch tracks a remote.

## Create branches and PRs

Default base branch is `main` unless the repo's default is different (`gh repo view --json defaultBranchRef`).

For slice `i` of `N`:

1. Branch `i=1` from `main`. Branch `i>1` from slice `i-1`'s branch.
2. Commit only that slice.
3. Push: `git push -u origin HEAD`
4. Open the PR with `--base` set to the previous branch (`main` for `1/N`):

```bash
gh pr create --base <previous-branch> --head <this-branch> --title "{imperative title} ({i}/{N})" --body "$(cat <<'EOF'
## Stack

| PR | Description |
| --- | --- |
| (1/N) | … |
| **👉 (i/N)** | … |
| (N/N) | … |

## Why

- …

## How

- …

## What

- …

## Alternate approaches considered

- …

## Schema changes

None

## Screenshots / video

None — no user-visible changes

## Test plan

- [ ] …
EOF
)"
```

Capture each PR number from `gh pr create` output (or `gh pr view --json number,url`).

Then rebuild the table with real numbers and links, and write it to **every** PR:

```bash
gh pr edit <n> --body "$(cat <<'EOF'
## Stack

| PR | Description |
| --- | --- |
| [#123](https://github.com/KATT/isbabyoutyet/pull/123) 1/3 | Backfill existing data |
| **👉 [#124](https://github.com/KATT/isbabyoutyet/pull/124) 2/3** | Add the UI |
| [#125](https://github.com/KATT/isbabyoutyet/pull/125) 3/3 | Follow-up cleanup |

## Why

- …

## How

- …

## What

- …

## Alternate approaches considered

- …

## Schema changes

None

## Screenshots / video

None — no user-visible changes

## Test plan

- [ ] …
EOF
)"
```

Each edited body still highlights **that** PR in the PR column (`**👉 …**`). Keep the template sections (Why, How, What, Alternate approaches considered, Schema changes, Screenshots / video, Test plan) and anything the user asked for below the table. Fill Schema changes properly when `schema.ts` or related Convex migrations changed; otherwise `None`. Fill Screenshots / video according to root `AGENTS.md`; never omit it.

## Detect an existing stack

```bash
gh pr list --state open --json number,title,baseRefName,headRefName,url
```

A stack is related branches whose titles contain `(n/N)` and whose `--base` values chain: `1/N` → `main`, `2/N` → `1/N`'s head, and so on.

```bash
gh pr view <n> --json number,title,baseRefName,headRefName,body,url
```

When adding to or rewriting an existing stack, reuse those branches and PR numbers. Refresh the table on every PR in the chain.

## Update a middle PR

1. Commit on the middle branch and push it (`git push` if history is unchanged).
2. Rebase each later stack branch onto its updated parent, in order:

```bash
git checkout <later-branch>
git rebase <updated-parent-branch>
git push --force-with-lease
```

3. Never rebase or force-push `main`.
4. If titles, count, or descriptions changed, `gh pr edit` every PR in the stack so the top table stays complete and current.

Ask before `--force-with-lease` unless the user already asked to update the stack.

## After a PR in the stack merges

Merge in order: `1/N`, then `2/N`, then the rest.

When `i/N` merges:

1. Update the next open PR onto the default branch (or onto the new previous open PR):

```bash
git checkout <next-branch>
git rebase main
git push --force-with-lease
gh pr edit <next-n> --base main
```

2. Refresh the stack table on every remaining open PR (mark merged rows as merged in the Description cell if useful, still using only the two columns).

## Report back

Return each PR's number, title (`… (n/N)`), URL, and base branch. Note anything not yet in the stack.
