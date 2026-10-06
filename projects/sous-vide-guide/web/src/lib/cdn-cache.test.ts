import { describe, expect, it } from "vitest";

import { withCdnCache } from "@/lib/cdn-cache";

function html(init: ResponseInit = {}) {
  return new Response("<!doctype html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function request(headers: Record<string, string>, method = "GET") {
  return new Request("https://guide.test/", { headers, method });
}

function cacheHeaders(response: Response) {
  return {
    cacheControl: response.headers.get("cache-control"),
    cdnCacheControl: response.headers.get("vercel-cdn-cache-control"),
    vary: response.headers.get("vary"),
  };
}

const notCached = { cacheControl: null, cdnCacheControl: null, vary: null };

describe("withCdnCache", () => {
  it("caches a cookieless page per Accept-Language", async () => {
    const response = withCdnCache(html(), {
      keyedLocale: null,
      locale: "en-US",
      request: request({ "accept-language": "en-US,en;q=0.9" }),
    });

    expect(cacheHeaders(response)).toEqual({
      cacheControl: "public, max-age=0, must-revalidate",
      cdnCacheControl: "max-age=86400, stale-while-revalidate=31536000",
      vary: "Accept-Language",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html>");
  });

  it("caches the base locale for a missing or unsupported Accept-Language", () => {
    const missing = withCdnCache(html(), { keyedLocale: null, locale: "sv", request: request({}) });
    const unsupported = withCdnCache(html(), {
      keyedLocale: null,
      locale: "sv",
      request: request({ "accept-language": "fr" }),
    });

    expect(cacheHeaders(missing).vary).toBe("Accept-Language");
    expect(cacheHeaders(unsupported).vary).toBe("Accept-Language");
  });

  it("does not cache a page a cookie rendered in another locale than Accept-Language", () => {
    const response = withCdnCache(html(), {
      keyedLocale: null,
      locale: "sv",
      request: request({ "accept-language": "en-US", cookie: "PARAGLIDE_LOCALE=sv" }),
    });

    expect(cacheHeaders(response)).toEqual(notCached);
  });

  it("caches a page keyed by its locale cookie without varying on Accept-Language", () => {
    const response = withCdnCache(html(), {
      keyedLocale: "sv",
      locale: "sv",
      request: request({ "accept-language": "en-US", cookie: "PARAGLIDE_LOCALE=sv" }),
    });

    expect(cacheHeaders(response)).toEqual({
      cacheControl: "public, max-age=0, must-revalidate",
      cdnCacheControl: "max-age=86400, stale-while-revalidate=31536000",
      vary: null,
    });
  });

  it("does not cache under a locale key the page was not rendered in", () => {
    const forged = withCdnCache(html(), {
      keyedLocale: "en-US",
      locale: "sv",
      request: request({ "accept-language": "sv" }),
    });
    const unknownCookie = withCdnCache(html(), {
      keyedLocale: "_",
      locale: "sv",
      request: request({ cookie: "PARAGLIDE_LOCALE=xx" }),
    });

    expect(cacheHeaders(forged)).toEqual(notCached);
    expect(cacheHeaders(unknownCookie)).toEqual(notCached);
  });

  it("keeps an existing Vary entry", () => {
    const response = withCdnCache(
      html({ headers: { "content-type": "text/html", vary: "Accept-Encoding" } }),
      { keyedLocale: null, locale: "sv", request: request({ "accept-language": "sv" }) },
    );

    expect(cacheHeaders(response).vary).toBe("Accept-Encoding, Accept-Language");
  });

  it("only caches successful HTML responses to GET and HEAD", () => {
    const sv = { "accept-language": "sv" };
    const options = { keyedLocale: null, locale: "sv" };

    expect(
      cacheHeaders(withCdnCache(html(), { ...options, request: request(sv, "HEAD") })).vary,
    ).toBe("Accept-Language");
    expect(
      cacheHeaders(withCdnCache(html(), { ...options, request: request(sv, "POST") })),
    ).toEqual(notCached);
    expect(
      cacheHeaders(withCdnCache(html({ status: 404 }), { ...options, request: request(sv) })),
    ).toEqual(notCached);
    expect(
      cacheHeaders(
        withCdnCache(new Response(null, { headers: { location: "/" }, status: 307 }), {
          ...options,
          request: request(sv),
        }),
      ),
    ).toEqual(notCached);
    expect(
      cacheHeaders(
        withCdnCache(Response.json({}), {
          ...options,
          request: request(sv),
        }),
      ),
    ).toEqual(notCached);
  });
});
