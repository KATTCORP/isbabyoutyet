import { useSyncExternalStore } from "react";

/**
 * Stable client ISO date for SSR-safe demos. Server snapshot is fixed; the
 * client snapshot is filled once on first read so the store identity stays
 * stable across re-renders.
 */
let clientDateSnapshot: string | null = null;

function getClientDateSnapshot() {
  if (clientDateSnapshot === null) {
    clientDateSnapshot = new Date().toISOString();
  }
  return clientDateSnapshot;
}

export function useClientDate(opts: { serverSnapshot: string }) {
  return useSyncExternalStore(noopSubscribe, getClientDateSnapshot, () => opts.serverSnapshot);
}

const noopSubscribe = () => () => undefined;
