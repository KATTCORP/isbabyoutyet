import { useSyncExternalStore } from "react";

/**
 * Subscribes to a 1Hz clock while `enabled`. Lives in lib so feature UI can
 * derive countdowns without calling useSyncExternalStore directly.
 */
export function useCurrentSecond(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeToCurrentSecond : noopSubscribe,
    getCurrentSecond,
    () => null,
  );
}

function subscribeToCurrentSecond(notify: () => void) {
  const interval = window.setInterval(notify, 1000);
  return () => window.clearInterval(interval);
}

function getCurrentSecond() {
  return Math.floor(Date.now() / 1000);
}

const noopSubscribe = () => () => undefined;
