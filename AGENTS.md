# Agent notes

This is a **pnpm + Turborepo monorepo**. Product apps live under `projects/`;
shared libraries live under `packages/`.

```
projects/
  isbabyoutyet/          # Is Baby Out Yet? (web + Convex + email)
  sous-vide-guide/       # Sous Vide Guide (web only)
packages/                # shared UI, form-guard, oxlint plugins, …
```

Product-specific agent guidance lives next to the product:

- [`projects/isbabyoutyet/AGENTS.md`](projects/isbabyoutyet/AGENTS.md) — baby app
  overlays, Convex, i18n catalog, seed/demo
- [`projects/isbabyoutyet/backend/AGENTS.md`](projects/isbabyoutyet/backend/AGENTS.md) —
  Convex AI guidelines / `npx convex ai-files install`
- [`projects/sous-vide-guide/AGENTS.md`](projects/sous-vide-guide/AGENTS.md) — guide
  app (when present on the branch)

Root notes below apply to **every** web app under `projects/*/web`.

## React hooks policy (`useEffect` / local state)

Feature code under `projects/*/web/src/components` and `projects/*/web/src/routes`
must not use `useEffect` / `useLayoutEffect`, local-state hooks (`useState`,
`useReducer`, `useActionState`, `useOptimistic`), or `useSyncExternalStore`.
Prefer:

- **URL / nested routes** for shareable UI (overlays, tabs, lightboxes)
- **Queries / mutations / `useTransition` / `useDeferredValue`** for server data
  and non-blocking pending UI
- **Uncontrolled triggers** (`PopoverTrigger`, `DialogTrigger`, `DrawerTrigger`)
  for settings editors and similar ephemeral open/close

### `projects/*/web/src/lib` audited seams

Lib may use effects, local state, and `useSyncExternalStore` when the hook is a
**reusable seam** that owns cleanup for an external system (timers, observers,
blob URLs, module stores). Oxlint exemptions apply only to `use-*` hooks plus
explicitly listed seam files — not the whole `lib/` tree.

Checklist before adding a lib hook with `useEffect` / `useState` /
`useSyncExternalStore`:

1. **Reusable** — at least one clear consumer pattern, not a single feature’s
   private lifecycle parked to dodge the ban
2. **Documented** — file comment states what external system it syncs
3. **Tested** when timing or subscription behavior is non-trivial
4. **No re-export** of banned React hooks (`no-banned-react-reexport`)
5. **Latest callbacks** — use `useEffectEvent` so effects/observers always
   see a fresh closure without listing the callback as a dependency. Do not
   read or write `ref.current` during render (`react/refs`).

`packages/ui` (vendored shadcn) is exempt. First-party packages stay under the
rules; rare file overrides need a comment citing the concrete constraint.

## Tests

Prefer automated tests (Vitest / jsdom) over a GUI browser. Do **not** use a
computer-use agent unless the user asks for a walkthrough or the change cannot
be proven without a real viewport (layout overflow, animation, pointer
hit-testing). Do not open a browser just to capture PR screenshots.

`vi.mock` / `vi.hoisted` / `vi.doMock` (and the `jest` equivalents) are banned
repo-wide by the `no-mock` oxlint plugin. Build a seam instead:

- **Components:** export a presentational `…View` marked `@internal` and pass
  data plus handlers as props; keep query/mutation wiring in the container.
- **Server handlers / guards:** take the effectful dependency as a parameter.
- **Routing:** render under a real memory router rather than stubbing
  `@tanstack/react-router`.
- **Convex / React Query:** prefer in-memory `convex-test` harnesses over
  hand-built handler maps when the package has a Convex backend.
- **Everything else:** `vi.fn` and `vi.spyOn` are fine. `vi.stubGlobal` is the
  allowed exception for jsdom/window host APIs. Do not use `vi.mock`.

## TypeScript

When reading or editing TypeScript, follow
[`.agents/skills/typescript-best-practices/SKILL.md`](.agents/skills/typescript-best-practices/SKILL.md)
(discriminated unions, no `any`, earned casts only, schema-derived types).

## Pull requests

Fill every section in [`.github/pull_request_template.md`](.github/pull_request_template.md).
For stacked PRs, also follow
[`.agents/skills/create-stacked-prs/SKILL.md`](.agents/skills/create-stacked-prs/SKILL.md).

### Screenshots and video

- Every PR includes the `## Screenshots / video` section from the template.
- For user-visible UI changes, attach screenshots of the important final states.
- For interactions, animations, or multi-step flows, attach a short video.
- If visual evidence is not applicable, write `None — <brief reason>`.
  Do not start computer use solely to fill this section.
