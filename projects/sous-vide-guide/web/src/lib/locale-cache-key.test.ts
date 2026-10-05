import { describe, expect, it } from "vitest";

import { localeCacheKeyRoutes, takeLocaleCacheKey } from "@/lib/locale-cache-key";

describe("localeCacheKeyRoutes", () => {
  it("keys the page on each exact locale cookie, then on any other cookie value", () => {
    expect(localeCacheKeyRoutes({ cookieName: "LOCALE", locales: ["sv", "en-US"] })).toEqual([
      {
        check: true,
        dest: "/?__locale=sv",
        has: [{ key: "LOCALE", type: "cookie", value: { eq: "sv" } }],
        src: "^/$",
      },
      {
        check: true,
        dest: "/?__locale=en-US",
        has: [{ key: "LOCALE", type: "cookie", value: { eq: "en-US" } }],
        src: "^/$",
      },
      {
        check: true,
        dest: "/?__locale=_",
        has: [{ key: "LOCALE", type: "cookie" }],
        src: "^/$",
      },
    ]);
  });
});

describe("takeLocaleCacheKey", () => {
  it("passes a request without the key param through untouched", () => {
    const request = new Request("https://guide.test/?q=lax");
    const cacheKey = takeLocaleCacheKey(request);

    expect(cacheKey.locale).toBeNull();
    expect(cacheKey.request).toBe(request);
  });

  it("strips the key param and keeps the rest of the request", () => {
    const request = new Request("https://guide.test/?q=lax&__locale=en-US&unit=c", {
      headers: { cookie: "PARAGLIDE_LOCALE=en-US" },
    });
    const cacheKey = takeLocaleCacheKey(request);

    expect(cacheKey.locale).toBe("en-US");
    expect(cacheKey.request.url).toBe("https://guide.test/?q=lax&unit=c");
    expect(cacheKey.request.headers.get("cookie")).toBe("PARAGLIDE_LOCALE=en-US");
  });
});
