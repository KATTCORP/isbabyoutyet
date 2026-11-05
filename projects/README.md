# Projects

Each project owns its app code, hosting config, env files, and backend (if
any). Code shared by more than one project goes in `packages/`.

| Project | Workspaces |
| --- | --- |
| [Is Baby Out Yet?](isbabyoutyet/README.md) | `web/`, `backend/` (Convex), `email/` |
| [Sous Vide Guide](sous-vide-guide/README.md) | `web/` |

## Sentry

A web app reports errors to a Sentry project named `personal-<directory>` in
the `trpclabs` org (JavaScript), for example `personal-isbabyoutyet`. An app
with Convex also gets `personal-<directory>-backend` (platform Node.js). Convex
reports uncaught function errors itself: in each deployment, open Settings →
Integrations → Sentry and paste that backend project's DSN. Each web app calls
`@sentry/tanstackstart-react` directly.

## Vercel deploys

Each `web/vercel.json` sets `ignoreCommand` to
[`vercelIgnoreBuild.ts`](../packages/scripts/src/vercelIgnoreBuild.ts), which
skips the deploy unless a changed file is a build input. Build inputs are the
project, every workspace it depends on (read from `package.json`), and root
install files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`turbo.json`, `.nvmrc`, `.npmrc`). Docs, tests and agent config never count.
It diffs against the branch's last successful deploy, or the merge-base with
`main` on a first deploy, and builds whenever it cannot tell. Vercel's clone is
shallow and has no `origin`, so it fetches the base from the GitHub repo.

Vercel runs the step before install, with pnpm 9 on `PATH`. So the command
first installs `@workspace/scripts` (for Effect) with the `packageManager` pnpm
through `corepack`, then runs the script with `node`. A failed install or script
exits 1, which builds. The whole step takes about 3s with Vercel's build cache
and about 6s without it.

## Rules for every `projects/*/web`

**No effects or local state in feature code.** `src/components` and
`src/routes` must not use `useEffect` / `useLayoutEffect`, `useState` /
`useReducer` / `useActionState` / `useOptimistic`, or `useSyncExternalStore`.
Use these instead:

- URL state and nested routes for shareable UI (overlays, tabs, lightboxes)
- Queries, mutations, `useTransition`, and `useDeferredValue` for server data
  and pending UI
- Uncontrolled triggers (`PopoverTrigger`, `DialogTrigger`, `DrawerTrigger`)
  for ephemeral open/close

`src/lib` may hold an audited seam: a reusable `use-*` hook (or an explicitly
exempted file) that owns cleanup for an external system such as timers,
observers, or blob URLs. A seam must have a file comment naming that system,
tests when timing is non-trivial, `useEffectEvent` for callbacks, and no
`ref.current` access during render. It must not re-export the banned hooks.
`packages/ui` (vendored shadcn) is exempt.

**Loaders:** a route's independent queries must prefetch in parallel. Follow
[`no-loader-waterfalls`](../.agents/skills/no-loader-waterfalls/SKILL.md).

**Lint:** web `src/` also bans `?:` optionals (use `T | undefined` or
`T | null` with a required key), overzealous destructuring, and literal UI
strings (use i18n).

**Tests:** export a presentational `…View` (marked `@internal`) that takes data
and handlers as props, and keep query/mutation wiring in the container. Render
routes under a real memory router instead of stubbing
`@tanstack/react-router`.
