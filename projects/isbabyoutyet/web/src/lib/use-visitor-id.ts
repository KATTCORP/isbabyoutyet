import { useSyncExternalStore } from "react";
import {
  readRemembered,
  recallInBrowser,
  subscribeToRemembered,
  type Remembered,
} from "@/lib/remembered";

const VISITOR_ID = "visitor-id";

/**
 * Where the id lived before it was a cookie. Still read, so the messages a
 * visitor left back then stay theirs. Their next post moves it.
 */
const EARLIER_STORAGE_KEY = "encouragement-visitor-id";

/**
 * The visitor id is what makes an anonymous visitor's messages theirs to
 * mark, edit and delete. It is made up for their first post and remembered
 * from then on (`@/lib/remembered`).
 */
export function rememberedVisitorId(visitorId: string): Remembered {
  return { name: VISITOR_ID, value: visitorId };
}

/** The id a browser sent along with a request, if it has one. */
export function visitorIdOfRequest(request: Request) {
  return readRemembered(request.headers.get("cookie"), VISITOR_ID);
}

function getStoredVisitorId(): string {
  if (globalThis.window === undefined) {
    return "";
  }
  return recallInBrowser(VISITOR_ID) ?? localStorage.getItem(EARLIER_STORAGE_KEY) ?? "";
}

/** This browser's visitor id, or null when it has not posted yet. */
export function peekVisitorId() {
  const visitorId = getStoredVisitorId();
  return visitorId === "" ? null : visitorId;
}

/**
 * Reactive visitor id. SSR snapshot is "" so first paint matches loaders
 * that omit visitorId.
 */
export function useStoredVisitorId() {
  return useSyncExternalStore(subscribeToRemembered, getStoredVisitorId, () => "");
}
