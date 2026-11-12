import { describe, expect, test, vi } from "vitest";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import {
  babyCache,
  finishCaching,
  forOneDay,
  secondsUntilNextDay,
  sharedCacheHeaders,
  untilDeploy,
  withImmutableCache,
  withSharedCache,
} from "./cache";

function useFakeTimersResource(now: Date) {
  vi.useFakeTimers({ now });
  return makeResource({}, () => {
    vi.useRealTimers();
  });
}

function finish(opts: { method: string; personal: boolean; response: Response }) {
  return finishCaching(opts.response, {
    personal: opts.personal,
    request: new Request("https://example.com/baby/alba-willis", { method: opts.method }),
  });
}

function sharedResponse(init: ResponseInit) {
  return withSharedCache(new Response("ok", init), forOneDay("anonymous"));
}

describe("sharedCacheHeaders", () => {
  test("lets the CDN keep a copy that browsers always ask it for", () => {
    expect(sharedCacheHeaders(forOneDay("anonymous"))).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Vercel-CDN-Cache-Control": "public, s-maxage=86400",
    });
  });

  test("renders what only a deploy changes once a day, behind the copy it serves", () => {
    expect(sharedCacheHeaders(untilDeploy("anonymous"))["Vercel-CDN-Cache-Control"]).toBe(
      "public, s-maxage=86400, stale-while-revalidate=31536000",
    );
  });

  test("keeps one copy per language only when the visitor's language picks the render", () => {
    expect(sharedCacheHeaders(forOneDay("language")).Vary).toBe("Accept-Language");
    expect(sharedCacheHeaders(forOneDay("anonymous"))).not.toHaveProperty("Vary");
    expect(sharedCacheHeaders(forOneDay("everyone"))).not.toHaveProperty("Vary");
  });

  test("never varies on Cookie, which would stop Vercel caching the response at all", () => {
    for (const sameFor of ["anonymous", "everyone", "language"] as const) {
      expect(sharedCacheHeaders(untilDeploy(sameFor)).Vary ?? "").not.toMatch(/cookie/i);
    }
  });
});

describe("babyCache", () => {
  test("tags the baby and expires when the day ends in its time zone", async () => {
    await using _timers = useFakeTimersResource(new Date("2026-08-18T21:30:00.000Z"));

    // 22:30 in London (BST), 06:30 the next morning in Tokyo.
    expect(
      sharedCacheHeaders(babyCache({ _id: "j57abc", timeZone: "Europe/London" }, "anonymous")),
    ).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Vercel-Cache-Tag": "baby:j57abc",
      "Vercel-CDN-Cache-Control": "public, s-maxage=5400",
    });
    expect(babyCache({ _id: "j57abc", timeZone: "Asia/Tokyo" }, "anonymous").maxAgeSeconds).toBe(
      63_000,
    );
  });
});

describe("secondsUntilNextDay", () => {
  test.each([
    // The clocks go back at 02:00 on 25 October 2026 in London: a 25-hour day.
    { expected: 25 * 3600, now: "2026-10-24T23:00:00.000Z", timeZone: "Europe/London" },
    // They go forward at 01:00 on 29 March 2026: a 23-hour day.
    { expected: 23 * 3600, now: "2026-03-29T00:00:00.000Z", timeZone: "Europe/London" },
    { expected: 1, now: "2026-08-18T23:59:59.600Z", timeZone: "UTC" },
    { expected: 86_400, now: "2026-08-18T00:00:00.000Z", timeZone: "UTC" },
  ])("is $expected at $now in $timeZone", (testCase) => {
    expect(
      secondsUntilNextDay({ now: Date.parse(testCase.now), timeZone: testCase.timeZone }),
    ).toBe(testCase.expected);
  });
});

describe("finishCaching", () => {
  test("keeps a shared response for an anonymous read", async () => {
    const response = finish({
      method: "GET",
      personal: false,
      response: withSharedCache(new Response("ok"), {
        maxAgeSeconds: 600,
        sameFor: "anonymous",
        staleSeconds: 0,
        tags: ["baby:j57abc"],
      }),
    });

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=600");
    expect(response.headers.get("Vercel-Cache-Tag")).toBe("baby:j57abc");
    expect(await response.text()).toBe("ok");
  });

  test.each([
    { name: "a response no route shared", response: () => new Response("ok") },
    { name: "a personal request", personal: true },
    { method: "POST", name: "a write" },
    { name: "a redirect", response: () => sharedResponse({ status: 307 }) },
    { name: "a missing page", response: () => sharedResponse({ status: 404 }) },
    {
      name: "a response that sets a cookie",
      response: () => sharedResponse({ headers: { "Set-Cookie": "a=b" } }),
    },
  ])("makes $name private", (testCase) => {
    const response = finish({
      method: testCase.method ?? "GET",
      personal: testCase.personal ?? false,
      response: (testCase.response ?? (() => sharedResponse({})))(),
    });

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
  });

  test("shares what is the same for everyone with a personal visitor too", () => {
    const response = finish({
      method: "GET",
      personal: true,
      response: withSharedCache(new Response("ok"), forOneDay("everyone")),
    });

    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=86400");
    // The marker is for the server alone.
    expect([...response.headers.keys()]).not.toContain("x-cache-for-everyone");
  });

  test("keeps the status, body and other headers of a response it makes private", async () => {
    const response = finish({
      method: "GET",
      personal: true,
      response: new Response("gone", { headers: { "X-Robots-Tag": "noindex" }, status: 404 }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await response.text()).toBe("gone");
  });
});

describe("withImmutableCache", () => {
  test("lets browsers keep a content-named resource too, whoever asks", async () => {
    const response = finish({
      method: "GET",
      personal: true,
      response: withImmutableCache(
        new Response("png", { headers: { "Content-Type": "image/png" } }),
      ),
    });

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=31536000");
    expect(await response.text()).toBe("png");
  });
});
