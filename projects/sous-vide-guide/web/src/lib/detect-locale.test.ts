import { describe, expect, it } from "vitest";

import { mapAcceptLanguage, mapLanguageTag } from "@/lib/map-language-tag";

describe("mapLanguageTag", () => {
  it("maps en-US and bare en", () => {
    expect(mapLanguageTag("en-US")).toBe("en-US");
    expect(mapLanguageTag("EN-us")).toBe("en-US");
    expect(mapLanguageTag("en")).toBe("en-GB");
    expect(mapLanguageTag("en-AU")).toBe("en-GB");
    expect(mapLanguageTag("en-CA")).toBe("en-GB");
    expect(mapLanguageTag("sv")).toBe("sv");
  });
});

describe("mapAcceptLanguage", () => {
  it("honors q-values", () => {
    expect(mapAcceptLanguage("fr;q=0.8,en-US;q=0.9")).toBe("en-US");
    expect(mapAcceptLanguage("sv,en;q=0.8")).toBe("sv");
    expect(mapAcceptLanguage("en")).toBe("en-GB");
    expect(mapAcceptLanguage(null)).toBeNull();
  });
});
