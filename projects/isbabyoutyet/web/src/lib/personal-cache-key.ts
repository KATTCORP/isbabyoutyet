/**
 * A personal request carries a cookie that changes what the server renders:
 * a session (signed-in UI and data) or a chosen language. Its response is for
 * that one visitor, so `cache.ts` never shares it.
 *
 * Vercel's CDN keys its cache on the URL and refuses to key on `Cookie`, so
 * on its own it would hand a personal visitor the copy it stored for
 * everyone else. {@link personalCacheKeyRoutes} gives personal requests a
 * URL of their own by adding a query param, and {@link takePersonalCacheKey}
 * strips it again before the app sees the URL.
 *
 * No `@/` imports: `vite.config.ts` loads this module to emit the routes.
 */

const PERSONAL_CACHE_KEY_PARAM = "__personal";

/**
 * Matches a `Cookie` header with a Better Auth cookie: the session, its
 * cached data, the Convex JWT; `__Secure-` prefixed in production. It errs
 * towards a session: a false match only costs a cache hit and a token check.
 */
const SESSION_COOKIE = String.raw`better-auth\.`;

/** A session cookie, or Paraglide's language cookie. */
const PERSONAL_COOKIE = String.raw`${SESSION_COOKIE}|PARAGLIDE_LOCALE=`;

/**
 * Whether a `Cookie` header could carry a session. Without one the visitor
 * is anonymous, and nobody needs to ask the auth server.
 */
export function hasSessionCookie(cookie: string | null | undefined) {
  return new RegExp(SESSION_COOKIE).test(cookie ?? "");
}

/**
 * Pages whose shared copy differs from what a personal visitor gets. A new
 * shared page goes here too. Leaving one out is not a leak, but its
 * signed-in visitors get the anonymous copy and look signed out on it.
 */
const SHARED_PAGES = "^(/|/auth/login|/auth/signup|/baby/.+|/og|/og/preview)$";

/**
 * Build Output API routes that send a personal request for a shared page to
 * its own cache key. They run before the filesystem phase, and `check` sends
 * the rewritten request on through it to the server function.
 *
 * @internal Consumed by `vite.config.ts`, which `knip --production` does not trace.
 */
export function personalCacheKeyRoutes() {
  return [
    {
      check: true,
      dest: `$1?${PERSONAL_CACHE_KEY_PARAM}=1`,
      has: [{ key: "cookie", type: "header", value: `.*(?:${PERSONAL_COOKIE}).*` }],
      src: SHARED_PAGES,
    },
  ];
}

type PersonalCacheKey = {
  personal: boolean;
  /** The request without the cache-key param. */
  request: Request;
};

/**
 * Splits the cache-key param off a request and says whether it is personal.
 * A request that arrives on the personal key counts as personal whatever its
 * cookies, so nobody can fill that key with an anonymous render.
 */
export function takePersonalCacheKey(request: Request): PersonalCacheKey {
  const url = new URL(request.url);
  const hasPersonalCookie = new RegExp(PERSONAL_COOKIE).test(request.headers.get("Cookie") ?? "");
  if (!url.searchParams.has(PERSONAL_CACHE_KEY_PARAM)) {
    return { personal: hasPersonalCookie, request };
  }
  url.searchParams.delete(PERSONAL_CACHE_KEY_PARAM);
  return { personal: true, request: new Request(url, request) };
}
