import { describe, expect, test } from "vitest";
import { personalCacheKeyRoutes, takePersonalCacheKey } from "./personal-cache-key";

function request(opts: { cookie: string | null; path: string }) {
  return new Request(`https://example.com${opts.path}`, {
    headers: opts.cookie === null ? {} : { Cookie: opts.cookie },
  });
}

describe("takePersonalCacheKey", () => {
  test.each([
    "__Secure-better-auth.session_token=abc",
    "better-auth.session_token=abc",
    "theme=dark; better-auth.convex_jwt=abc",
    "PARAGLIDE_LOCALE=sv",
    "__vdpl=dpl_123; PARAGLIDE_LOCALE=sv",
  ])("counts a request with the cookie %s as personal", (cookie) => {
    const taken = takePersonalCacheKey(request({ cookie, path: "/baby/alba-willis" }));

    expect(taken.personal).toBe(true);
    expect(taken.request.url).toBe("https://example.com/baby/alba-willis");
  });

  test.each([null, "", "__vdpl=dpl_123", "theme=dark; _ga=GA1.2.3"])(
    "leaves a request with the cookie %s anonymous",
    (cookie) => {
      const original = request({ cookie, path: "/baby/alba-willis?item=abc" });
      const taken = takePersonalCacheKey(original);

      expect(taken.personal).toBe(false);
      expect(taken.request).toBe(original);
    },
  );

  test("strips the cache key and keeps the rest of the request", () => {
    const taken = takePersonalCacheKey(
      request({ cookie: "PARAGLIDE_LOCALE=sv", path: "/baby/alba-willis?item=abc&__personal=1" }),
    );

    expect(taken.personal).toBe(true);
    expect(taken.request.url).toBe("https://example.com/baby/alba-willis?item=abc");
    expect(taken.request.headers.get("Cookie")).toBe("PARAGLIDE_LOCALE=sv");
  });

  test("counts a forged cache key as personal, so it cannot fill that key with a shared copy", () => {
    const taken = takePersonalCacheKey(request({ cookie: null, path: "/?__personal=1" }));

    expect(taken.personal).toBe(true);
    expect(taken.request.url).toBe("https://example.com/");
  });
});

describe("personalCacheKeyRoutes", () => {
  const [route] = personalCacheKeyRoutes();
  const src = new RegExp(route?.src ?? "");
  const cookie = new RegExp(`^${route?.has[0]?.value ?? ""}$`);

  test.each([
    "/",
    "/auth/login",
    "/auth/signup",
    "/baby/alba-willis",
    "/baby/alba-willis/share",
    "/baby/alba-willis/updates/abc/photo",
    "/og",
    "/og/preview",
  ])("rewrites the shared page %s onto the personal key", (path) => {
    expect(path.replace(src, route?.dest ?? "")).toBe(`${path}?__personal=1`);
  });

  test.each(["/dashboard", "/api/auth/get-session", "/assets/index.js", "/favicon.ico"])(
    "leaves %s alone",
    (path) => {
      expect(src.test(path)).toBe(false);
    },
  );

  test("matches the cookies the server counts as personal, and no others", () => {
    expect(cookie.test("__vdpl=dpl_123; __Secure-better-auth.session_token=abc")).toBe(true);
    expect(cookie.test("PARAGLIDE_LOCALE=sv")).toBe(true);
    expect(cookie.test("__vdpl=dpl_123; theme=dark")).toBe(false);
  });
});
