const MAX_CACHE_TAG_LENGTH = 256;

export const ALL_BABY_PAGES_CACHE_TAG = "baby-pages";

function cacheTagPart(value: string) {
  return value.replaceAll(/[^A-Za-z0-9_.:-]/g, "-");
}

function boundedCacheTag(prefix: string, value: string) {
  return `${prefix}${cacheTagPart(value)}`.slice(0, MAX_CACHE_TAG_LENGTH);
}

export function babyIdCacheTag(babyId: string) {
  return boundedCacheTag("baby-id:", babyId);
}

export function babyPublicIdCacheTag(publicId: string) {
  return boundedCacheTag("baby-public-id:", publicId);
}

export async function deriveCachePurgeToken(secret: string) {
  const bytes = new TextEncoder().encode(`isbabyoutyet:cache-purge:v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
