/**
 * Canonical production origin — used for rel=canonical and og:url so search
 * engines and crawlers consolidate on the live site, not preview/local hosts.
 */
export const CANONICAL_ORIGIN = "https://isbabyoutyet.com";

/**
 * Origin for absolute asset URLs (og:image, sitemap). Prefers the current
 * deployment's VITE_SITE_URL so preview/local share cards resolve to this host.
 */
function getSiteOrigin() {
  const fromEnv = import.meta.env.VITE_SITE_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return CANONICAL_ORIGIN;
}

export function absoluteUrl(path: string, origin: string = getSiteOrigin()) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export function canonicalUrl(path: string) {
  return absoluteUrl(path, CANONICAL_ORIGIN);
}
