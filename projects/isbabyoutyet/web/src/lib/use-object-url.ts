import { useEffect, useState, useSyncExternalStore } from "react";

type ObjectUrlStore = {
  getSnapshot: () => string | null;
  setUrl: (next: string | null) => void;
  subscribe: (notify: () => void) => () => void;
};

function createObjectUrlStore(): ObjectUrlStore {
  let url: string | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => url,
    setUrl: (next) => {
      if (url === next) {
        return;
      }
      url = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
  };
}

/**
 * Creates an object URL for a Blob/File and revokes it when the blob changes
 * or the consumer unmounts. Create/revoke run in an effect (not during render)
 * so discarded renders cannot leak URLs or revoke a committed URL mid-paint.
 * The URL is published through an external store rather than useState so the
 * effect does not call setState (banned by react/set-state-in-effect).
 */
export function useObjectUrl(blob: Blob | null) {
  const [store] = useState(createObjectUrlStore);

  useEffect(() => {
    if (!blob) {
      store.setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    store.setUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
      store.setUrl(null);
    };
  }, [blob, store]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}
