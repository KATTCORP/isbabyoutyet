import { useRef, useSyncExternalStore } from "react";

/**
 * Stable client ISO date for SSR-safe demos. Server snapshot is fixed; client
 * caches the first client-side date so the store identity stays stable.
 */
export function useClientDate(opts: { serverSnapshot: string }) {
  const clientDateRef = useRef<string | null>(null);
  if (clientDateRef.current === null) {
    clientDateRef.current = new Date().toISOString();
  }
  const clientDate = clientDateRef.current;
  return useSyncExternalStore(
    noopSubscribe,
    () => clientDate,
    () => opts.serverSnapshot,
  );
}

const noopSubscribe = () => () => undefined;
