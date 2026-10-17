export const VISITOR_ID_HINT_HEADER = "x-visitor-id";

const MIN_VISITOR_ID_LENGTH = 8;
const MAX_VISITOR_ID_LENGTH = 128;

/** Accepts the browser localStorage visitor id sent on sign-in / sign-up. */
export function parseVisitorIdHint(value: string | null | undefined) {
  if (value == null) {
    return null;
  }
  const visitorId = value.trim();
  if (visitorId.length < MIN_VISITOR_ID_LENGTH || visitorId.length > MAX_VISITOR_ID_LENGTH) {
    return null;
  }
  return visitorId;
}

/**
 * One-way proof that an encouragement was posted from a browser, so the
 * public feed can mark the visitor's own posts without taking their visitor
 * id as a query arg. Salted with the baby id so tags cannot link one visitor
 * across baby pages.
 */
export async function visitorTag(opts: { babyId: string; visitorId: string }) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${opts.babyId}:${opts.visitorId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
