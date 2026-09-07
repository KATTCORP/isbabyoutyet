import { isJsonObjectValue, parseOptionalString } from "@workspace/runtime/json";

/**
 * Key under which email sign-in / sign-up responses carry the Convex JWT.
 * Set by `convex/authConvexToken.ts`; read by `apps/web` so the browser can
 * authenticate its Convex websocket straight from the sign-in response.
 */
export const CONVEX_TOKEN_RESPONSE_KEY = "convexToken";

/** Extract the JWT from a sign-in / sign-up response body decorated by `convexTokenInAuthResponse`. */
export function parseConvexTokenFromAuthResponse<TReturned>(returned: TReturned) {
  if (!isJsonObjectValue(returned) || !(CONVEX_TOKEN_RESPONSE_KEY in returned)) {
    return null;
  }
  return parseOptionalString(returned[CONVEX_TOKEN_RESPONSE_KEY]);
}
