/**
 * Vercel's CDN refuses to cache a response that varies on `Cookie`, yet the
 * locale cookie decides which language the page renders in. The CDN routes
 * from {@link localeCacheKeyRoutes} copy that cookie into a query param, which
 * is part of the cache key, and {@link takeLocaleCacheKey} strips it again
 * before the app sees the URL.
 *
 * No `@/` imports: `vite.config.ts` loads this module to emit the routes.
 */

const LOCALE_CACHE_KEY_PARAM = "__locale";

/** Key for a locale cookie holding anything but a locale; never cached. */
const UNKNOWN_LOCALE_CACHE_KEY = "_";

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

type LocaleCacheKeyRoutesOptions = {
  cookieName: string;
  locales: ReadonlyArray<string>;
};

/**
 * Build Output API routes that rewrite `/` to a per-locale cache key when the
 * locale cookie is set. They run before the filesystem phase and only match
 * the page itself, so assets and other paths are untouched. `check` sends the
 * rewritten request on through the filesystem phase to the server function.
 *
 * After a `check` rewrite misses the filesystem, Vercel keeps matching the
 * routes that follow, and a later `dest` param overwrites an earlier one, so
 * at most one of these routes may match any request.
 *
 * @internal Consumed by `vite.config.ts`, which `knip --production` does not trace.
 */
export function localeCacheKeyRoutes(opts: LocaleCacheKeyRoutesOptions) {
  const localeCookies = opts.locales.map((locale) => ({
    locale,
    match: { key: opts.cookieName, type: "cookie", value: `^${escapeRegExp(locale)}$` },
  }));
  return [
    ...localeCookies.map((cookie) => ({
      check: true,
      dest: `/?${LOCALE_CACHE_KEY_PARAM}=${encodeURIComponent(cookie.locale)}`,
      has: [cookie.match],
      src: "^/$",
    })),
    {
      check: true,
      dest: `/?${LOCALE_CACHE_KEY_PARAM}=${UNKNOWN_LOCALE_CACHE_KEY}`,
      has: [{ key: opts.cookieName, type: "cookie" }],
      missing: localeCookies.map((cookie) => cookie.match),
      src: "^/$",
    },
  ];
}

/**
 * Splits the cache-key param off a request. `locale` is the locale the CDN
 * keyed the request under, or `null` when it is keyed on `Accept-Language`.
 */
export function takeLocaleCacheKey(request: Request) {
  const url = new URL(request.url);
  const locale = url.searchParams.get(LOCALE_CACHE_KEY_PARAM);
  if (locale === null) {
    return { locale, request };
  }
  url.searchParams.delete(LOCALE_CACHE_KEY_PARAM);
  return { locale, request: new Request(url, request) };
}
