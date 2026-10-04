# Toy projects

A pnpm + Turborepo monorepo of personal toy projects and the libraries they
share. `AGENTS.md` files are symlinks to the `README.md` beside them: one doc per
directory, for humans and agents alike. Read the one closest to the code you
are changing; each links further down.

| Path | What |
| --- | --- |
| [`projects/isbabyoutyet/`](projects/isbabyoutyet/README.md) | **Is Baby Out Yet?**: web app, Convex backend, email templates |
| [`projects/sous-vide-guide/`](projects/sous-vide-guide/README.md) | **Sous Vide Guide**: web app |
| [`projects/`](projects/README.md) | Rules shared by every `projects/*/web` |
| [`packages/`](packages/) | Shared libraries: `ui` (vendored shadcn), [`form-guard`](packages/form-guard/README.md), [`convex-prefetch`](packages/convex-prefetch/README.md), [`convex-cli`](packages/convex-cli/README.md), [`query-prefetch`](packages/query-prefetch/README.md), `runtime`, `scripts`, `oxlint-plugins` |
| [`.agents/skills/`](.agents/skills/) | Agent skills (third-party ones are pinned in `skills-lock.json`) |
| [`repos/`](#vendored-repositories) | Read-only upstream sources vendored with `git subtree` |

## Setup

Requires Node.js 24 ([`.nvmrc`](.nvmrc)).

```sh
pnpm install
pnpm dev                              # every workspace
pnpm dev-isbaby                       # Is Baby Out Yet? only
pnpm dev-sous                         # Sous Vide Guide only
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
  For stacks, follow [`create-stacked-prs`](.agents/skills/create-stacked-prs/SKILL.md),
  and the `link-stack` workflow links them as a native GitHub stack.
  In **Screenshots / video**, attach screenshots for visible UI changes and a
  short video for interactions. Otherwise write `None — <reason>`. Do not open
  a browser just to fill this section.
- **Effect:** before writing Effect code, read
  [`repos/effect/LLMS.md`](repos/effect/LLMS.md), then treat `repos/effect/`
  (implementation, tests, and docs) as the source of truth for idiomatic
  usage. Prefer its patterns over guesses or web search, especially for APIs
  that changed in v4. Code that uses Effect gets the `anti-slop-effect` lint
  rules through an `.oxlintrc.json` override; add new Effect code to its
  `files` list. Test it with `@effect/vitest`: `it.effect` gives each test a
  fresh `TestConsole` and `TestClock`, while `layer(...)` shares one set of
  services across its whole block, so keep per-test fakes in `it.effect`.

## Vendored repositories

`repos/` holds upstream source trees added with `git subtree --squash`, as
reference material for humans and agents. Read them, but do not edit them,
import from them, or treat them as part of this repo's code. Lint, format, and
knip ignore `repos/**`, and it is not a pnpm workspace.

| Path | Upstream |
| --- | --- |
| `repos/effect` | [`Effect-TS/effect`](https://github.com/Effect-TS/effect) `main` (4.0.0 at import) |

PRs are squash-merged, so the subtree's own squash commit never reaches `main`
and `git subtree pull` cannot find it. Re-import instead (the PR squashes this
into one commit):

```sh
git rm -rq repos/effect && git commit -qm "Remove vendored Effect"
git subtree add --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
```
