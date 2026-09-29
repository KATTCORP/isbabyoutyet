# isbabyoutyet monorepo

pnpm + Turborepo monorepo for **Is Baby Out Yet?** and sibling products.
`AGENTS.md` files are symlinks to the `README.md` beside them: one doc per
directory, for humans and agents alike. Read the one closest to the code you
are changing; each links further down.

| Path | What |
| --- | --- |
| [`projects/`](projects/README.md) | Product apps, plus rules shared by every `projects/*/web` |
| [`packages/`](packages/) | Shared libraries: `ui` (vendored shadcn), [`form-guard`](packages/form-guard/README.md), [`convex-prefetch`](packages/convex-prefetch/README.md), [`query-prefetch`](packages/query-prefetch/README.md), `runtime`, `scripts`, `oxlint-plugins` |
| [`.agents/skills/`](.agents/skills/) | Agent skills (third-party ones are pinned in `skills-lock.json`) |

## Setup

Requires Node.js 24 ([`.nvmrc`](.nvmrc)).

```sh
pnpm install
pnpm dev                              # every workspace
pnpm --filter '@isbabyoutyet/*' dev   # one product
pnpm checks                           # format, typecheck, changed tests, knip; run before calling work done
pnpm clean                            # wipe caches and reinstall
```

## Repo-wide rules

- **TypeScript:** follow
  [`typescript-best-practices`](.agents/skills/typescript-best-practices/SKILL.md).
  [`.oxlintrc.json`](.oxlintrc.json) enforces the rest (for example, at most
  two params per function), and web apps add stricter rules.
- **Tests:** prefer Vitest/jsdom over a browser. Only use a computer-use agent
  if the user asks for a walkthrough or the change needs a real viewport.
  `vi.mock` / `vi.hoisted` / `vi.doMock` are banned (`no-mock`). Build a seam
  instead: inject the dependency as a parameter or prop. `vi.fn`, `vi.spyOn`,
  and `vi.stubGlobal` (for host APIs) are fine. Use `await using` for cleanup,
  not lifecycle hooks or `try/finally`.
- **Pull requests:** fill every section of
  [`.github/pull_request_template.md`](.github/pull_request_template.md).
  For stacks, follow [`create-stacked-prs`](.agents/skills/create-stacked-prs/SKILL.md).
  In **Screenshots / video**, attach screenshots for visible UI changes and a
  short video for interactions. Otherwise write `None — <reason>`. Do not open
  a browser just to fill this section.
