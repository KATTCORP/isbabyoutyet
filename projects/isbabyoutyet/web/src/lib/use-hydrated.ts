import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

/**
 * `false` during SSR and while hydrating, `true` once the client has
 * hydrated. For UI that only exists in the browser: rendering it from the
 * first client render would not match the server HTML, and React would
 * throw the page away and re-render it from scratch (a visible jump).
 */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
