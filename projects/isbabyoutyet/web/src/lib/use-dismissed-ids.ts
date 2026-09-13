import { useSyncExternalStore } from "react";

/**
 * Module-level set of dismissed string ids with useSyncExternalStore so feature
 * components can hide UI after dismiss without local useState.
 *
 * `useIsDismissed` is a top-level hook (not a store method) so React Compiler
 * treats it as a hook. The snapshot is the dismissed boolean itself — returning
 * a version number and then reading the Set separately lets the compiler
 * memoize `isDismissed(id)` as a pure function of `id`, so "Got it" never
 * hides the UI.
 */
export function createDismissedIdsStore() {
  const dismissed = new Set<string>();
  const listeners = new Set<() => void>();

  function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }

  function dismiss(id: string) {
    if (dismissed.has(id)) {
      return;
    }
    dismissed.add(id);
    for (const listener of listeners) {
      listener();
    }
  }

  function isDismissed(id: string) {
    return dismissed.has(id);
  }

  function clear() {
    if (dismissed.size === 0) {
      return;
    }
    dismissed.clear();
    for (const listener of listeners) {
      listener();
    }
  }

  return { clear, dismiss, isDismissed, subscribe };
}

export function useIsDismissed(store: ReturnType<typeof createDismissedIdsStore>, id: string) {
  function getSnapshot() {
    return store.isDismissed(id);
  }
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
