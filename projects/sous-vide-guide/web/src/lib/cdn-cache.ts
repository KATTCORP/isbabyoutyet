import { mapAcceptLanguage } from "@/lib/map-language-tag";
import { baseLocale } from "@/paraglide/runtime";

/** Browsers revalidate every load, so a new deploy shows up immediately. */
const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/**
 * Vercel keys its CDN cache per deployment, and the guide's content only
 * changes with a deploy, so the edge can hold a page for the deployment's
 * lifetime. The daily background refresh only bounds how long a bad render
 * could linger.
 */
const CDN_CACHE_CONTROL = "max-age=86400, stale-while-revalidate=31536000";

type CdnCacheOptions = {
  /** `takeLocaleCacheKey(request).locale`. */
  keyedLocale: string | null;
  /** Locale the page was rendered in. */
  locale: string;
  request: Request;
};

function isCacheableHtml(response: Response, request: Request) {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    response.status === 200 &&
    (response.headers.get("content-type")?.includes("text/html") ?? false)
  );
}

/**
 * Lets Vercel's CDN cache server-rendered HTML, but only when every request
 * sharing this one's cache key renders the same locale. Requests keyed by the
 * locale cookie must have rendered that locale. Requests keyed on
 * `Accept-Language` must have rendered what that header alone picks, so a
 * cookie the CDN routes did not see can never leak into the shared entry.
 */
export function withCdnCache(response: Response, opts: CdnCacheOptions) {
  if (!isCacheableHtml(response, opts.request)) {
    return response;
  }
  const keyLocale =
    opts.keyedLocale ??
    mapAcceptLanguage(opts.request.headers.get("accept-language")) ??
    baseLocale;
  if (keyLocale !== opts.locale) {
    return response;
  }
  const cached = new Response(response.body, response);
  cached.headers.set("Cache-Control", BROWSER_CACHE_CONTROL);
  cached.headers.set("Vercel-CDN-Cache-Control", CDN_CACHE_CONTROL);
  if (opts.keyedLocale === null) {
    cached.headers.append("Vary", "Accept-Language");
  }
  return cached;
}
