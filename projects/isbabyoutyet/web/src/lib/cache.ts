/**
 * How responses are cached, in three rules (the README's "Caching" section
 * has the reasons):
 *
 * 1. A response is private unless its route shares it, with
 *    {@link sharedCacheHeaders} on a page or {@link withSharedCache} on a
 *    resource.
 * 2. Vercel's CDN keeps a shared response for the visitors it is the same
 *    for ({@link SharedCache.sameFor}), by default those without a session or
 *    language cookie. {@link finishCaching} makes everything else private: a
 *    personal request, a redirect, an error, a write.
 * 3. A shared response lives until it expires or one of its tags is purged
 *    (`backend/convex/triggers.ts`). A deploy starts an empty cache.
 */
import { babyCacheTag } from "@isbabyoutyet/backend/src/cacheTags";

const ONE_DAY_SECONDS = 86_400;
/** The longest Vercel's CDN keeps anything. */
const ONE_YEAR_SECONDS = 31_536_000;

const PRIVATE = "private, no-store";
/** The CDN holds the copy; a browser asks for it every time. */
const BROWSER_REVALIDATES = "public, max-age=0, must-revalidate";

export type SharedCache = {
  /** Seconds the CDN serves its copy without asking the server. */
  maxAgeSeconds: number;
  /**
   * Who gets the same response:
   * - `everyone`: no cookie or header changes it, like a baby's manifest.
   * - `anonymous`: every visitor without a session or language cookie, like
   *   a baby page, which is in the baby's language.
   * - `language`: every anonymous visitor with the same `Accept-Language`,
   *   like the homepage, which is in the visitor's language.
   */
  sameFor: "anonymous" | "everyone" | "language";
  /**
   * Seconds more the CDN may serve the copy while it fetches a new one in
   * the background. 0 when an expired copy is wrong.
   */
  staleSeconds: number;
  /** Purging any of these drops the copy early. */
  tags: ReadonlyArray<string>;
};

/**
 * Only a deploy changes it, and a deploy starts an empty cache. The CDN
 * still renders it again once a day, in the background, so a bad render
 * can't stay for good.
 */
export function untilDeploy(sameFor: SharedCache["sameFor"]): SharedCache {
  return {
    maxAgeSeconds: ONE_DAY_SECONDS,
    sameFor,
    staleSeconds: ONE_YEAR_SECONDS,
    tags: [],
  };
}

/** Changes with the calendar day, in no particular time zone. */
export function forOneDay(sameFor: SharedCache["sameFor"]): SharedCache {
  return { maxAgeSeconds: ONE_DAY_SECONDS, sameFor, staleSeconds: 0, tags: [] };
}

/**
 * Seconds until the calendar day ends in `timeZone`, at least 1.
 *
 * @internal exported for tests
 */
export function secondsUntilNextDay(opts: { now: number; timeZone: string }) {
  const secondsIntoDay = (time: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      second: "2-digit",
      timeZone: opts.timeZone,
    }).formatToParts(new Date(time));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
    return part("hour") * 3600 + part("minute") * 60 + part("second");
  };
  // Exact on a 24-hour day. A daylight-saving day is an hour shorter or
  // longer, which leaves the guess an hour past midnight or an hour short.
  const guess = opts.now + (ONE_DAY_SECONDS - secondsIntoDay(opts.now)) * 1000;
  const pastMidnight = secondsIntoDay(guess);
  const midnight =
    pastMidnight > ONE_DAY_SECONDS / 2
      ? guess + (ONE_DAY_SECONDS - pastMidnight) * 1000
      : guess - pastMidnight * 1000;
  return Math.max(1, Math.round((midnight - opts.now) / 1000));
}

/**
 * A baby's page or manifest. It changes when the baby's data does, which
 * purges the tag, and when the day does in the baby's time zone: the
 * countdown, and the day in the share image's URL.
 */
export function babyCache(
  baby: { _id: string; timeZone: string },
  sameFor: SharedCache["sameFor"],
): SharedCache {
  return {
    maxAgeSeconds: secondsUntilNextDay({ now: Date.now(), timeZone: baby.timeZone }),
    sameFor,
    staleSeconds: 0,
    tags: [babyCacheTag(baby._id)],
  };
}

/**
 * Marks a shared response as the same for `everyone`, so that
 * {@link finishCaching} shares it with personal visitors too. It never
 * leaves the server.
 */
const FOR_EVERYONE = "X-Cache-For-Everyone";

export function sharedCacheHeaders(cache: SharedCache) {
  const stale = cache.staleSeconds > 0 ? `, stale-while-revalidate=${cache.staleSeconds}` : "";
  const headers: Array<[name: string, value: string]> = [
    ["Cache-Control", BROWSER_REVALIDATES],
    ["Vercel-CDN-Cache-Control", `public, s-maxage=${cache.maxAgeSeconds}${stale}`],
  ];
  if (cache.tags.length > 0) {
    headers.push(["Vercel-Cache-Tag", cache.tags.join(",")]);
  }
  if (cache.sameFor === "language") {
    headers.push(["Vary", "Accept-Language"]);
  }
  if (cache.sameFor === "everyone") {
    headers.push([FOR_EVERYONE, "1"]);
  }
  return Object.fromEntries(headers);
}

export function withSharedCache(response: Response, cache: SharedCache) {
  const shared = new Response(response.body, response);
  for (const [name, value] of Object.entries(sharedCacheHeaders(cache))) {
    shared.headers.set(name, value);
  }
  return shared;
}

/**
 * For a URL that names its own content, like the share image with its hash:
 * the same for everyone, and browsers keep it too and never ask again.
 */
export function withImmutableCache(response: Response) {
  const immutable = withSharedCache(response, {
    maxAgeSeconds: ONE_YEAR_SECONDS,
    sameFor: "everyone",
    staleSeconds: 0,
    tags: [],
  });
  immutable.headers.set("Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
  return immutable;
}

function isShared(response: Response) {
  return /\bs-maxage=/.test(response.headers.get("Vercel-CDN-Cache-Control") ?? "");
}

/**
 * The last word on every response (`server.ts`). A response stays shared
 * only if its route shared it and it is the successful read that every
 * visitor it is for gets.
 */
export function finishCaching(response: Response, opts: { personal: boolean; request: Request }) {
  const finished = new Response(response.body, response);
  const forEveryone = finished.headers.has(FOR_EVERYONE);
  finished.headers.delete(FOR_EVERYONE);
  const isRead = opts.request.method === "GET" || opts.request.method === "HEAD";
  if (
    isShared(finished) &&
    isRead &&
    (forEveryone || !opts.personal) &&
    finished.status === 200 &&
    !finished.headers.has("Set-Cookie")
  ) {
    return finished;
  }
  finished.headers.set("Cache-Control", PRIVATE);
  finished.headers.set("Vercel-CDN-Cache-Control", PRIVATE);
  finished.headers.delete("Vercel-Cache-Tag");
  return finished;
}
