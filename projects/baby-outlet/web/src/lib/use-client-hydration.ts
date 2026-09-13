import { useSyncExternalStore } from "react";

/**
 * True after client hydration, false during SSR. Used to remount forms that
 * read localStorage defaults only on the client.
 */
export function useClientHydration() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const noopSubscribe = () => () => undefined;
