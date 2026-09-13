import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { isJsonObjectValue } from "@workspace/runtime/json";
import { CONVEX_TOKEN_RESPONSE_KEY } from "../src/convexToken";

/**
 * The Convex Better Auth plugin mints a JWT on `/sign-in/*` and `/sign-up/*`
 * and stores it in an httpOnly `…convex_jwt` cookie for SSR. JWTs are
 * base64url segments joined by dots, so a single match on the joined
 * `Set-Cookie` header is unambiguous regardless of cookie prefix or how the
 * runtime combines multiple `Set-Cookie` values.
 */
export function readConvexJwtFromSetCookie(headers: Headers | undefined) {
  const setCookie = headers?.get("set-cookie") ?? "";
  const match = /convex_jwt=([\w.-]+)/.exec(setCookie);
  return match?.[1] ?? null;
}

/**
 * Better Auth plugin: after email sign-in / sign-up, copy the JWT the Convex
 * plugin just set as a cookie into the JSON body as `convexToken`.
 *
 * Without this the browser needs two more sequential round trips before it can
 * authenticate Convex (`/get-session` so the provider notices the session, then
 * `/convex/token` to mint a second JWT). Must be listed AFTER `convex()` in
 * `plugins` — plugin after-hooks run in plugin order and this one reads the
 * `Set-Cookie` header the Convex hook appended.
 */
export function convexTokenInAuthResponse() {
  return {
    hooks: {
      after: [
        {
          handler: createAuthMiddleware(async (ctx) => {
            const token = readConvexJwtFromSetCookie(ctx.context.responseHeaders);
            const returned = ctx.context.returned;
            if (token === null || !isJsonObjectValue(returned)) {
              return;
            }
            return ctx.json({ ...returned, [CONVEX_TOKEN_RESPONSE_KEY]: token });
          }),
          matcher: (ctx) => ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email",
        },
      ],
    },
    id: "convex-token-in-auth-response",
  } satisfies BetterAuthPlugin;
}
