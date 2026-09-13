# Agent notes

## React hooks policy (`useEffect` / local state)

Feature code under `projects/baby-outlet/web/src/components` and `projects/baby-outlet/web/src/routes` must not
use `useEffect` / `useLayoutEffect`, local-state hooks (`useState`,
`useReducer`, `useActionState`, `useOptimistic`), or `useSyncExternalStore`.
Prefer:

- **URL / nested routes** for shareable UI (overlays, tabs, lightboxes)
- **Queries / mutations / `useTransition`** for server data and pending UI
- **Uncontrolled triggers** (`PopoverTrigger`, `DialogTrigger`, `DrawerTrigger`)
  for settings editors and similar ephemeral open/close

### `projects/baby-outlet/web/src/lib` audited seams

Lib may use effects, local state, and `useSyncExternalStore` when the hook is a
**reusable seam** that owns cleanup for an external system (timers, observers,
blob URLs, module stores). Oxlint exemptions apply only to `use-*` hooks plus
`overlay-nav.ts` — not the whole `lib/` tree.

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

## Routing / scroll / overlays

Baby settings (`/baby/$publicId/settings`), post-update (`/baby/$publicId/post`),
share preview (`/baby/$publicId/share`), and photo lightboxes (`/baby/$publicId/photo`,
`/baby/$publicId/updates/$updateId/photo`) are nested child routes rendered into
the baby layout `<Outlet />` so the page stays mounted underneath. Share and
photo route loaders prefetch their full image in the browser via
`prefetchBrowserImage` (same initiator pattern as notification push capability).

Overlays open with a pushed history entry and close by going back. Use
`@/lib/overlay-nav` (TanStack has `history.back` / `canGoBack` and
`linkOptions`, but no overlay-history helper). Each overlay has two hooks over
one spec:

- **Route component:** `use…Overlay(params)` (e.g. `useBabyPostOverlay`)
  owns the open state (deferred one frame for the enter transition) and the
  form guard. Spread `overlay.rootProps` onto the Base UI Root — it carries
  `open`, the guarded `onOpenChange`, and `onOpenChangeComplete` — and wrap
  forms in `<FormGuardProvider guard={overlay.guard}>`. `overlay.close()` is
  the unconditional close (after a save); `overlay.requestClose()` asks like a
  user dismissal. Presentational components take `OverlayControl`
  (`{ close, closeLinkProps, guard, rootProps }`); tests build one with
  `WithOverlayControl` from `@/test/overlayControl`. Spread
  `overlay.closeLinkProps` onto in-overlay close CTAs so primary click runs
  the exit transition while modifier-clicks keep the href.
- **Layouts / nav docks:** `use…OverlayLinks(params)` returns `{ openLink,
  closeLink, dismiss }`. `openLink` pushes (`state: { overlay: true }`,
  viewport preload, `resetScroll: false`) — pass it to a real `<Link>` so the
  child loader runs before click. `dismiss()` asks the *mounted* overlay to
  close through its guard (exit animation, discard prompt) and only falls back
  to `history.back()` / the replace `closeLink` when nothing is mounted.
- **Close navigation** runs from `onOpenChangeComplete(false)` with
  `ignoreBlocker: true`: the guard already vetted the dismissal, and a blocked
  replace or a reverted `back()` would strand the URL on the overlay route
  with nothing visible (the bug behind the settings "Discard" no-op).
- `openOverlayLink` / `closeOverlayLink` / `dismissOverlay` stay exported for
  imperative flows and tests.

Keep `replace: true` for slug canonicalize and auth redirects. Admin tab switches
still use `resetScroll: false` (not overlay history).

## Overlay forms (form-guard)

Dialog, popover, sheet, and route-overlay forms must use `useFormGuard` +
`FormGuardProvider` + `useZodForm` + `Form` from `@/components/Form`. `Form`
registers dirty/submitting with the guard. The guard owns the overlay's open
state — no `actionsRef`:

- Popover / dialog editors opened from a trigger:
  `useFormGuard({ defaultOpen: false })`, then `<Popover {...guard.rootProps}>`.
- Open state owned elsewhere (route overlays, URL search params):
  `useFormGuard({ open, onOpenChange })`. Route overlays get this for free from
  `use…Overlay`.
- Full-page forms that only need the navigation guard: `useFormGuard(null)`.

Close after a successful save with `guard.close()` (unconditional). Do not
save from `DialogClose` / `PopoverClose` — that unmounts the overlay before the
mutation finishes and skips the leave-guard. Discard is tracked per form: a
discarded form re-rendering or unmounting while its overlay animates out does
not re-arm the guard; only a fresh edit session (clean, then dirty) does.

Live controls that persist immediately (language select, the settings message-
notifications switch) are not overlay forms and do not need a Save button.

## Tests

Prefer automated tests (Vitest / jsdom) over a GUI browser. Do **not** use a
computer-use agent unless the user asks for a walkthrough or the change cannot
be proven without a real viewport (layout overflow, animation, pointer
hit-testing). Do not open a browser just to capture PR screenshots.

`vi.mock` / `vi.hoisted` / `vi.doMock` (and the `jest` equivalents) are banned
repo-wide by the `no-mock` oxlint plugin. Build a seam instead:

- **Components:** export a presentational `…View` marked `@internal` and pass
  data plus handlers as props; keep query/mutation wiring in the container.
- **Server handlers / guards:** take the effectful dependency as a parameter
  (`handleCachePurge(request, { deleteByTag })`,
  `resolveAuthGuard({ context, fetchToken })`).
- **Routing:** render under a real memory router — `renderWithTestRouter` /
  `renderWithOverlayRouter` — rather than stubbing `@tanstack/react-router`.
- **Convex / React Query:** prefer `createConvexTestHarness` +
  `renderWithConvexTest`, `renderMountedFileRoute`, and `runRouteLoader` /
  `runRouteBeforeLoad` so components and file routes hit the in-memory
  `convex-test` backend (seed with `seedOwnedBaby` / `signUpTestUser` /
  `seedBabyWithPhoto`, switch callers via `harness.withIdentity`). Avoid
  hand-built handler maps and production `*View` / DI props when integration
  tests can mount the real component. Wrap in the real `ConvexProvider` /
  `QueryClientProvider`.
- **Convex stub lint:** `workspace/no-invalid-convex-client` bans
  `new ConvexReactClient("https://example.invalid")` in web tests;
  `workspace/no-test-preloaded-query` bans
  `@workspace/convex-prefetch/test-helpers` fake handles.
- **Everything else:** `vi.fn` and `vi.spyOn` are still fine (e.g. spying on
  `sonner`'s `toast` methods). `vi.stubGlobal` is the allowed exception for
  jsdom/window host APIs — use `stubJsdomWindow()` (an `await using` resource)
  or go through `renderResource` / `renderWithTestRouter` /
  `renderWithConvexTest` / `renderMountedFileRoute` / `createConvexTestHarness`.
  Do not use `vi.mock`.

## Convex

When working under `projects/baby-outlet/backend/`, also follow
[`projects/baby-outlet/backend/AGENTS.md`](projects/baby-outlet/backend/AGENTS.md).

For route loaders and other project skills, see
[`.agents/AGENTS.md`](.agents/AGENTS.md).

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
  Use before/after screenshots when the difference is not obvious from the final
  state alone.
- For interactions, animations, or multi-step flows, attach a short video that
  starts immediately before the demonstration and ends immediately after it.
- Use the smallest artifact set that proves the change. Do not include failed
  runs, setup steps, stale UI, redundant captures, or sensitive data.
- Capture artifacts from the final tested preview revision and remove references
  to superseded artifacts when the UI changes.
- If visual evidence is not applicable, or you did not run a browser
  walkthrough, write `None — <brief reason>` instead of omitting the section.
  Do not start computer use solely to fill this section.
