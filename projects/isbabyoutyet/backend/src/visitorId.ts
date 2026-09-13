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
