# Is Baby Out Yet — agent notes

Product-specific guidance for `projects/isbabyoutyet`. Shared monorepo rules
(hooks ban, tests, PR template) live in the root [`AGENTS.md`](../../AGENTS.md).

## Layout

| Path | Package | Role |
| --- | --- | --- |
| `web/` | `@isbabyoutyet/web` | TanStack Start app |
| `backend/` | `@isbabyoutyet/backend` | Convex functions, schema, seed assets |
| `email/` | `@isbabyoutyet/email` | React Email templates (password reset, etc.) |

Convex AI skills ship with the backend (`backend/.agents/skills/`). They are
installed and refreshed by Convex itself — from `backend/` run
`npx convex ai-files install` (see `backend/AGENTS.md`). Do not hand-copy those
skills into the repo root; keep them next to the Convex project so regenerating
them overwrites the right tree.

## Routing / scroll / overlays

Baby settings (`/baby/$publicId/settings`), post-update (`/baby/$publicId/post`),
share preview (`/baby/$publicId/share`), and photo lightboxes
(`/baby/$publicId/photo`, `/baby/$publicId/updates/$updateId/photo`) are nested
child routes rendered into the baby layout `<Outlet />` so the page stays mounted
underneath. Share and photo route loaders prefetch their full image in the
browser via `prefetchBrowserImage` (same initiator pattern as notification push
capability).

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

## i18n

UI copy uses English literals as catalog keys via `useI18n().t("…")` (base
locale `en-GB`). Message files live in `web/messages/{locale}.json`. Paraglide
owns locale detection/cookies; the custom `t()` catalog is what feature code
calls. Oxlint `i18n-literal/*` is enforced under `web/src`.

## Convex / tests

When working under `backend/`, also follow [`backend/AGENTS.md`](backend/AGENTS.md).

Prefer `createConvexTestHarness` + `renderWithConvexTest` / `renderMountedFileRoute`
so components and file routes hit the in-memory `convex-test` backend (seed with
`seedOwnedBaby` / `signUpTestUser` / `seedBabyWithPhoto`, switch callers via
`harness.withIdentity`).
