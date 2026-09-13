import { describe, expect, it } from "vitest";

import { detectLocaleFromRequestHeaders } from "@/lib/detect-locale.server";

describe("detectLocaleFromRequestHeaders", () => {
  it("prefers the Paraglide locale cookie", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => "en",
      readHeader: () => "sv",
    });
    expect(locale).toBe("en");
  });

  it("falls back to Accept-Language", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: (name) => (name === "accept-language" ? "en-US,en;q=0.9" : undefined),
    });
    expect(locale).toBe("en");
  });

  it("falls back to Swedish", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: () => undefined,
    });
    expect(locale).toBe("sv");
  });
});
