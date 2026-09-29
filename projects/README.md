# Projects

Each project owns its app code, hosting config, env files, and backend (if
any). Code shared by more than one project goes in `packages/`.

| Project | Workspaces |
| --- | --- |
| [Is Baby Out Yet?](isbabyoutyet/README.md) | `web/`, `backend/` (Convex), `email/` |
| [Sous Vide Guide](sous-vide-guide/README.md) | `web/` |

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
