import { useSyncExternalStore } from "react";

const STORAGE_KEY_VISITOR_ID = "encouragement-visitor-id";
const VISITOR_ID_CHANGE_EVENT = "encouragement-visitor-id-change";

/** Get or create a unique visitor ID (immutable once created) — client only. */
export function getVisitorId(): string {
  if (globalThis.window === undefined) {
    return "";
  }
  let visitorId = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY_VISITOR_ID, visitorId);
    window.dispatchEvent(new Event(VISITOR_ID_CHANGE_EVENT));
  }
  return visitorId;
}

function getStoredVisitorId(): string {
  if (globalThis.window === undefined) {
    return "";
  }
  return localStorage.getItem(STORAGE_KEY_VISITOR_ID) ?? "";
}

/** Existing localStorage visitor id, or null when none has been created yet. */
export function peekVisitorId() {
  const visitorId = getStoredVisitorId();
  return visitorId === "" ? null : visitorId;
}

function subscribeToStoredVisitorId(notify: () => void) {
  window.addEventListener(VISITOR_ID_CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(VISITOR_ID_CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

/**
 * Reactive localStorage visitor id. SSR snapshot is "" so first paint matches
 * loaders that omit visitorId.
 */
export function useStoredVisitorId() {
  return useSyncExternalStore(subscribeToStoredVisitorId, getStoredVisitorId, () => "");
}
