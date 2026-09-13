# Form leave-guard

Headless answer to one question — **"may we leave this unsaved form?"** — asked
by two different systems: overlay dismissal (Base UI `onOpenChange`) and in-app
navigation (TanStack Router `useBlocker` / `beforeunload`). The guard owns a
submit lock, a dirty registry, and a single discard prompt per overlay stack;
the app renders the prompt UI.

## Layers

```
dismiss.ts        pure decision: allow / block / confirm
guard-store.ts    framework-free store: dirty registry, submit lock, discard queue, stacking
use-form-guard.ts React bridge: one lazy store per guard, useSyncExternalStore for prompt state
router.ts         TanStack Router adapter: useBlocker + beforeunload on the store
```

The store is plain TypeScript with callbacks — no React, no form library. The
React layer never mutates during render: stacking is wired in effects, dirty
flags register in effects, and the only reactive output (prompt open) flows
through `useSyncExternalStore`.

## Usage

The guard owns the overlay's open state (no `actionsRef`), so `rootProps`
carries `open` plus a guarded `onOpenChange`:

```tsx
function Editor() {
  const guard = useFormGuard({ defaultOpen: false });
  return (
    <Popover {...guard.rootProps}>
      <PopoverTrigger … />
      <PopoverContent>
        <FormGuardProvider guard={guard} renderDiscardPrompt={renderMyDiscardDialog}>
          <MyForm onClose={guard.close} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}
```

Three overlay modes:

- `useFormGuard({ defaultOpen })` — **uncontrolled**: editors that open from a
  trigger; the guard owns `open`.
- `useFormGuard({ open, onOpenChange })` — **controlled**: open state lives
  elsewhere (a route-backed overlay, a URL search param). Every allowed close
  — user dismissal, Discard, `close()` — arrives as `onOpenChange(false)`.
- `useFormGuard(null)` — no overlay; a full-page form that only needs the
  navigation guard.

Two ways to close from code: `guard.close()` is unconditional (success paths,
Cancel buttons), while `guard.requestClose()` behaves like a user dismissal —
blocked while a form submits, confirmed while one is dirty — for close
controls rendered outside the overlay (nav toggles).

`FormGuardProvider` figures out stacking by itself: the outermost provider is
the stack root, which mounts the navigation blocker and renders the single
`DiscardPrompt` for the whole stack. The app supplies only the localized
prompt UI:

```tsx
<FormGuardProvider guard={guard} renderDiscardPrompt={(props) => <MyDiscardDialog {...props} />}>
  …
</FormGuardProvider>;

function MyDiscardDialog(props: DiscardPromptProps) {
  // props.open / props.onOpenChange(false) = keep editing / props.onDiscard()
}
```

Forms register reactive state with
`useRegisterFormState({ isDirty, isSubmitting, isSubmitSuccessful })` — plain
booleans, a structural subset of React Hook Form's `formState`. There is no
imperative submit lock: `isSubmitting` blocks user dismissal while it holds,
and `isDirty && !isSubmitting && !isSubmitSuccessful` is the "unsaved edits"
signal — leaving is allowed mid-submit (success paths navigate before
resolving) and after a successful save, while a failed submit re-arms the
guard on its own.

Discard is tracked **per form**: confirming the prompt marks every form that
currently blocks as discarded, and it stays discarded while it keeps reporting
the same unsaved edits — re-registering on a re-render, or unmounting while the
overlay animates out, never re-arms the guard. Only a fresh edit session (the
form reporting clean, then dirty again) guards again. This is what lets the
overlay's own close navigation run after Discard without the router blocker
asking a second time.

## Router blocker and overlay closes

The stack root mounts a TanStack `useBlocker` for in-app navigation and
`beforeunload`. An overlay's _own_ close navigation (after its exit
transition) must pass `ignoreBlocker: true` — the guard already answered, and a
blocked replace / reverted `history.back()` would leave the URL on the overlay
route with nothing visible. `projects/isbabyoutyet/web/src/lib/overlay-nav.ts` does this.

## Stacked overlays

Dirty state registers with every ancestor store, submit locks and leave
permission apply stack-wide, and a nested guard's `confirm` routes its discard
request to the stack root. One backdrop click that dismisses both a dialog and
a nested popover therefore yields **one** prompt whose Discard closes the whole
stack; "Keep editing" cancels both closes.

## Source files

- `src/dismiss.ts` — `overlayDismissDecision(...)`, `shouldBlockOverlayDismiss(...)`, native date-picker sniffing
- `src/guard-store.ts` — `createFormGuardStore()` and the `FormGuardStore` interface
- `src/use-form-guard.ts` — `useFormGuard(...)`, `FormGuardProvider`, `useRegisterFormState(...)`
- `src/router.ts` — the internal TanStack Router blocker the root provider mounts
