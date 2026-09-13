import { describe, expect, it } from "vitest";

import { detectLocaleFromRequestHeaders } from "@/lib/detect-locale.server";

describe("detectLocaleFromRequestHeaders", () => {
  it("prefers the Paraglide locale cookie", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => "en-US",
      readHeader: () => "sv",
    });
    expect(locale).toBe("en-US");
  });

  it("maps en-US Accept-Language to American English", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: (name) => (name === "accept-language" ? "en-US,en;q=0.9" : undefined),
    });
    expect(locale).toBe("en-US");
  });

  it("maps bare en Accept-Language to British English", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: (name) => (name === "accept-language" ? "en" : undefined),
    });
    expect(locale).toBe("en-GB");
  });

  it("falls back to Swedish", () => {
    const locale = detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: () => undefined,
    });
    expect(locale).toBe("sv");
  });
});
