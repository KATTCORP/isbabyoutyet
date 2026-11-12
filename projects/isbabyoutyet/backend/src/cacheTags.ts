/**
 * The one cache tag: everything the web app's CDN shares about a baby (its
 * page, manifest and share image) carries it, and a write to the baby's
 * public data purges it (`convex/triggers.ts`).
 */
export function babyCacheTag(babyId: string) {
  return `baby:${babyId}`;
}

/** Bearer token for the web app's `/api/cache/purge`, known to both sides. */
export async function deriveCachePurgeToken(secret: string) {
  const bytes = new TextEncoder().encode(`isbabyoutyet:cache-purge:v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
