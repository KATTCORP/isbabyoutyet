import type { Mock } from "vitest";
import { expect, test, vi } from "vitest";
import { createFormGuardStore, REQUEST_CLOSE_REASON } from "./guard-store.js";
import type { FormGuardStore, FormStateFlags, OverlayDismissEventDetails } from "./guard-store.js";

/** A dismiss event for the store, and the spy that tells whether it was cancelled. */
interface DismissEvent {
  readonly cancel: Mock<() => void>;
  readonly eventDetails: OverlayDismissEventDetails;
}

function dismissEvent(reason: string): DismissEvent {
  const cancel = vi.fn<() => void>();
  const eventDetails: OverlayDismissEventDetails = { cancel, reason };
  return { cancel, eventDetails };
}

function attachCloser(store: FormGuardStore) {
  const close = vi.fn();
  store.setCloser(close);
  return close;
}

function flags(partial: Partial<FormStateFlags>): FormStateFlags {
  return { isDirty: false, isSubmitSuccessful: false, isSubmitting: false, ...partial };
}

test("clean store allows user dismissal without cancelling", () => {
  const store = createFormGuardStore();
  const { cancel, eventDetails } = dismissEvent("escape-key");

  expect(store.handleOpenChange(false, eventDetails)).toBe("allow");
  expect(cancel).not.toHaveBeenCalled();
  expect(store.isPromptOpen()).toBe(false);
});

test("a submitting form blocks user dismissal but not the imperative success-close", () => {
  const store = createFormGuardStore();
  store.setFormState("note", flags({ isDirty: true, isSubmitting: true }));

  const escape = dismissEvent("escape-key");
  expect(store.handleOpenChange(false, escape.eventDetails)).toBe("block");
  expect(escape.cancel).toHaveBeenCalled();

  const imperative = dismissEvent("imperative-action");
  expect(store.handleOpenChange(false, imperative.eventDetails)).toBe("allow");
  expect(imperative.cancel).not.toHaveBeenCalled();
});

test("a requested close is guarded like a user dismissal", () => {
  const store = createFormGuardStore();

  store.setFormState("note", flags({ isDirty: true, isSubmitting: true }));
  const locked = dismissEvent(REQUEST_CLOSE_REASON);
  expect(store.handleOpenChange(false, locked.eventDetails)).toBe("block");

  store.setFormState("note", flags({ isDirty: true }));
  const dirty = dismissEvent(REQUEST_CLOSE_REASON);
  expect(store.handleOpenChange(false, dirty.eventDetails)).toBe("confirm");
  expect(store.isPromptOpen()).toBe(true);

  store.keepEditing();
  store.setFormState("note", flags({}));
  expect(store.handleOpenChange(false, dismissEvent(REQUEST_CLOSE_REASON).eventDetails)).toBe(
    "allow",
  );
});

test("submit outcome drives the unsaved-edits guard without imperative locks", () => {
  const store = createFormGuardStore();

  // Editing arms the guard.
  store.setFormState("note", flags({ isDirty: true }));
  expect(store.isDirty()).toBe(true);

  // Mid-submit, leaving is allowed: success paths navigate before resolving.
  store.setFormState("note", flags({ isDirty: true, isSubmitting: true }));
  expect(store.isDirty()).toBe(false);

  // A failed submit re-arms the guard by itself.
  store.setFormState("note", flags({ isDirty: true }));
  expect(store.isDirty()).toBe(true);

  // A successful submit keeps leaving allowed even while still dirty.
  store.setFormState("note", flags({ isDirty: true, isSubmitSuccessful: true }));
  expect(store.isDirty()).toBe(false);
});

test("one sibling's successful save does not unguard another sibling's edits", () => {
  const store = createFormGuardStore();
  store.setFormState("saved", flags({ isDirty: true, isSubmitSuccessful: true }));
  store.setFormState("draft", flags({ isDirty: true }));

  expect(store.isDirty()).toBe(true);
  expect(store.handleOpenChange(false, dismissEvent("escape-key").eventDetails)).toBe("confirm");
});

test("dirty store confirms dismissal and opens its own prompt", () => {
  const store = createFormGuardStore();
  store.setFormState("note", flags({ isDirty: true }));

  const { cancel, eventDetails } = dismissEvent("outside-press");
  expect(store.handleOpenChange(false, eventDetails)).toBe("confirm");
  expect(cancel).toHaveBeenCalled();
  expect(store.isPromptOpen()).toBe(true);
});

test("keep editing closes the prompt without closing the overlay", () => {
  const store = createFormGuardStore();
  const close = attachCloser(store);
  store.setFormState("note", flags({ isDirty: true }));
  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);

  store.keepEditing();
  expect(store.isPromptOpen()).toBe(false);
  expect(close).not.toHaveBeenCalled();
  expect(store.isDirty()).toBe(true);
});

test("discard allows leaving and closes every queued target", () => {
  const store = createFormGuardStore();
  const close = attachCloser(store);
  store.setFormState("note", flags({ isDirty: true }));
  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);

  store.discard();
  expect(store.isPromptOpen()).toBe(false);
  expect(close).toHaveBeenCalled();
  expect(store.isDirty()).toBe(false);
});

test("a discarded form that keeps re-registering its edits stays discarded", () => {
  const store = createFormGuardStore();
  store.setFormState("note", flags({ isDirty: true }));
  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);
  store.discard();

  // The overlay animates out while the dirty form is still mounted and
  // re-renders (identical flags), then unmounts and — same tree position,
  // same id — mounts again still reporting the stale dirty flags.
  store.setFormState("note", flags({ isDirty: true }));
  expect(store.isDirty()).toBe(false);
  store.setFormState("note", null);
  store.setFormState("note", flags({ isDirty: true }));
  expect(store.isDirty()).toBe(false);
  expect(store.handleOpenChange(false, dismissEvent("escape-key").eventDetails)).toBe("allow");
});

test("a fresh edit session after a discard re-arms the guard", () => {
  const store = createFormGuardStore();
  store.setFormState("note", flags({ isDirty: true }));
  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);
  store.discard();
  expect(store.isDirty()).toBe(false);

  // The discarded form unmounts; a new form instance mounts clean and the
  // user starts editing again.
  store.setFormState("note", null);
  store.setFormState("note", flags({}));
  store.setFormState("note", flags({ isDirty: true }));
  expect(store.isDirty()).toBe(true);
});

test("a nested dirty store routes its prompt to the stack root", () => {
  const root = createFormGuardStore();
  const child = createFormGuardStore();
  const rootClose = attachCloser(root);
  const childClose = attachCloser(child);
  child.setAncestors([root]);
  child.setFormState("note", flags({ isDirty: true }));
  root.setFormState("note", flags({ isDirty: true }));

  // One backdrop click dismisses both popups: child outside-press first…
  expect(child.handleOpenChange(false, dismissEvent("outside-press").eventDetails)).toBe("confirm");
  // …then the parent's own dismissal; both queue on the root's single prompt.
  expect(root.handleOpenChange(false, dismissEvent("outside-press").eventDetails)).toBe("confirm");
  expect(root.isPromptOpen()).toBe(true);
  expect(child.isPromptOpen()).toBe(false);

  root.discard();
  expect(childClose).toHaveBeenCalled();
  expect(rootClose).toHaveBeenCalled();
  // Both stores stop guarding the discarded edits while the overlays close.
  expect(child.isDirty()).toBe(false);
  expect(root.isDirty()).toBe(false);
});

test("keep editing on the root clears queued nested targets", () => {
  const root = createFormGuardStore();
  const child = createFormGuardStore();
  const rootClose = attachCloser(root);
  const childClose = attachCloser(child);
  child.setAncestors([root]);
  child.setFormState("note", flags({ isDirty: true }));

  child.handleOpenChange(false, dismissEvent("outside-press").eventDetails);
  expect(root.isPromptOpen()).toBe(true);

  root.keepEditing();
  expect(root.isPromptOpen()).toBe(false);
  expect(childClose).not.toHaveBeenCalled();
  expect(rootClose).not.toHaveBeenCalled();

  // The child is still guarded for the next dismissal.
  expect(child.handleOpenChange(false, dismissEvent("escape-key").eventDetails)).toBe("confirm");
});

test("prompt subscribers are notified on open and close, and can unsubscribe", () => {
  const store = createFormGuardStore();
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  store.setFormState("note", flags({ isDirty: true }));

  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);
  expect(listener).toHaveBeenCalledTimes(1);

  store.keepEditing();
  expect(listener).toHaveBeenCalledTimes(2);

  unsubscribe();
  store.handleOpenChange(false, dismissEvent("escape-key").eventDetails);
  expect(listener).toHaveBeenCalledTimes(2);
});

test("close without a wired overlay is a no-op", () => {
  const store = createFormGuardStore();
  expect(() => {
    store.close();
  }).not.toThrow();
});
