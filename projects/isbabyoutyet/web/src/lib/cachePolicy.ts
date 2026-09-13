import { babyOgImagePublicIdFromFileName } from "@isbabyoutyet/backend/src/babyOgImage";
import {
  ALL_BABY_PAGES_CACHE_TAG,
  babyIdCacheTag,
  babyPublicIdCacheTag,
} from "@isbabyoutyet/backend/src/cacheTags";

const PRIVATE_CACHE_CONTROL = "private, no-store, no-cache, max-age=0, must-revalidate";
const PUBLIC_BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const PUBLIC_STALE_SECONDS = 86_400;
const VERSIONED_IMAGE_MAX_AGE_SECONDS = 31_536_000;

export type PublicCachePolicy = {
  maxAgeSeconds: number;
  tags: ReadonlyArray<string>;
};

const PUBLIC_BABY_ROUTE_IDS = new Set([
  "/baby/$publicId/",
  "/baby/$publicId/share",
  "/baby/$publicId/photo",
  "/baby/$publicId/updates/$updateId/photo",
]);

function publicCacheHeaders(policy: PublicCachePolicy) {
  return {
    "Cache-Control": PUBLIC_BROWSER_CACHE_CONTROL,
    Vary: "Accept-Language, Cookie",
    "Vercel-Cache-Tag": policy.tags.join(","),
    "Vercel-CDN-Cache-Control": `public, s-maxage=${policy.maxAgeSeconds}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`,
  };
}

export function privateCacheHeaders() {
  return {
    "Cache-Control": PRIVATE_CACHE_CONTROL,
    Vary: "Cookie",
    "Vercel-CDN-Cache-Control": PRIVATE_CACHE_CONTROL,
  };
}

export function homepageCacheHeaders() {
  return publicCacheHeaders({ maxAgeSeconds: 86_400, tags: ["homepage"] });
}

export function previewCacheHeaders() {
  return publicCacheHeaders({ maxAgeSeconds: 86_400, tags: ["preview"] });
}

export function authPageCacheHeaders() {
  return publicCacheHeaders({ maxAgeSeconds: 3600, tags: ["auth-pages"] });
}

function babyPageCacheHeaders(publicId: string) {
  return publicCacheHeaders({
    maxAgeSeconds: 86_400,
    tags: [ALL_BABY_PAGES_CACHE_TAG, babyPublicIdCacheTag(publicId)],
  });
}

export function babyRouteCacheHeaders(opts: { publicId: string; routeIds: ReadonlyArray<string> }) {
  const isPublicRoute = opts.routeIds.some((routeId) => PUBLIC_BABY_ROUTE_IDS.has(routeId));
  return isPublicRoute ? babyPageCacheHeaders(opts.publicId) : privateCacheHeaders();
}

export function withPublicCache(response: Response, policy: PublicCachePolicy) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(publicCacheHeaders(policy))) {
    headers.set(name, value);
  }
  return responseWithHeaders(response, headers);
}

export function withVersionedImageCache(response: Response, tags: ReadonlyArray<string>) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${VERSIONED_IMAGE_MAX_AGE_SECONDS}, immutable`);
  headers.set(
    "Vercel-CDN-Cache-Control",
    `public, s-maxage=${VERSIONED_IMAGE_MAX_AGE_SECONDS}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`,
  );
  headers.set("Vercel-Cache-Tag", tags.join(","));
  headers.delete("Vary");
  return responseWithHeaders(response, headers);
}

function publicPagePolicy(pathname: string): PublicCachePolicy | null {
  if (pathname === "/") {
    return { maxAgeSeconds: 86_400, tags: ["homepage"] };
  }
  if (pathname === "/preview") {
    return { maxAgeSeconds: 86_400, tags: ["preview"] };
  }
  if (pathname === "/auth/login" || pathname === "/auth/signup") {
    return { maxAgeSeconds: 3600, tags: ["auth-pages"] };
  }
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return { maxAgeSeconds: 3600, tags: ["discovery"] };
  }
  if (pathname === "/og") {
    return { maxAgeSeconds: 86_400, tags: ["homepage"] };
  }

  const manifestMatch = /^\/baby\/manifest\/([^/]+)$/.exec(pathname);
  if (manifestMatch?.[1]) {
    return {
      maxAgeSeconds: 86_400,
      tags: [ALL_BABY_PAGES_CACHE_TAG, babyIdCacheTag(manifestMatch[1])],
    };
  }

  const babyOgMatch = /^\/og\/baby\/([^/]+)$/.exec(pathname);
  if (babyOgMatch?.[1]) {
    const publicId = babyOgImagePublicIdFromFileName(babyOgMatch[1]);
    return {
      maxAgeSeconds: 86_400,
      tags: [ALL_BABY_PAGES_CACHE_TAG, babyPublicIdCacheTag(publicId)],
    };
  }

  // Public overlay routes render only public baby data. Manager overlays
  // (`/_auth/settings` and `/_auth/post`) intentionally do not match and stay private.
  const babyPageMatch = /^\/baby\/([^/]+)(?:\/(?:share|photo)|\/updates\/[^/]+\/photo)?\/?$/.exec(
    pathname,
  );
  if (babyPageMatch?.[1]) {
    return {
      maxAgeSeconds: 86_400,
      tags: [ALL_BABY_PAGES_CACHE_TAG, babyPublicIdCacheTag(babyPageMatch[1])],
    };
  }

  return null;
}

function mergeVary(headers: Headers, values: ReadonlyArray<string>) {
  const existing = headers
    .get("Vary")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  headers.set("Vary", Array.from(new Set([...(existing ?? []), ...values])).join(", "));
}

function responseWithHeaders(response: Response, headers: Headers) {
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Makes caching deny-by-default at the final HTTP response seam. Public pages
 * are explicitly allowlisted and contain anonymous SSR only; everything else,
 * including auth endpoints and server functions, is private and non-cacheable.
 */
export function applyCachePolicy(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  const methodIsCacheable = request.method === "GET" || request.method === "HEAD";
  const policy = methodIsCacheable ? publicPagePolicy(new URL(request.url).pathname) : null;
  const cacheControl = headers.get("Cache-Control") ?? "";
  const explicitlyUncacheableRedirect =
    response.status >= 300 &&
    response.status < 400 &&
    headers.has("Location") &&
    /\bno-store\b/i.test(cacheControl);

  if (!policy || explicitlyUncacheableRedirect) {
    headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
    headers.set("Vercel-CDN-Cache-Control", PRIVATE_CACHE_CONTROL);
    headers.delete("Vercel-Cache-Tag");
    mergeVary(headers, ["Cookie"]);
    return responseWithHeaders(response, headers);
  }

  // Route/handler-specific policy is more precise than the pathname fallback
  // (for example immutable content-versioned OG images).
  if (/\bpublic\b/i.test(cacheControl) && headers.has("Vercel-CDN-Cache-Control")) {
    return responseWithHeaders(response, headers);
  }

  headers.set("Cache-Control", PUBLIC_BROWSER_CACHE_CONTROL);
  headers.set(
    "Vercel-CDN-Cache-Control",
    `public, s-maxage=${policy.maxAgeSeconds}, stale-while-revalidate=${PUBLIC_STALE_SECONDS}`,
  );
  headers.set("Vercel-Cache-Tag", policy.tags.join(","));
  mergeVary(headers, ["Accept-Language", "Cookie"]);
  return responseWithHeaders(response, headers);
}
