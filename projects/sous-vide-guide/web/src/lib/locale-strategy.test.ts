import { describe, expect, it } from "vitest";

import { registerAcceptLanguageStrategy } from "@/lib/locale-strategy";
import { extractLocaleFromRequestAsync } from "@/paraglide/runtime";

registerAcceptLanguageStrategy();

function request(headers: Record<string, string>) {
  return new Request("https://guide.test/", { headers });
}

describe("custom-acceptLanguage server strategy", () => {
  it("maps Accept-Language onto an app locale", async () => {
    expect(await extractLocaleFromRequestAsync(request({ "accept-language": "sv" }))).toBe("sv");
    expect(
      await extractLocaleFromRequestAsync(request({ "accept-language": "en-US,en;q=0.8" })),
    ).toBe("en-US");
    expect(await extractLocaleFromRequestAsync(request({ "accept-language": "en-AU" }))).toBe(
      "en-GB",
    );
  });

  it("lets an explicit cookie choice win over Accept-Language", async () => {
    expect(
      await extractLocaleFromRequestAsync(
        request({ "accept-language": "en-US", cookie: "other=1; PARAGLIDE_LOCALE=sv" }),
      ),
    ).toBe("sv");
  });

  it("ignores an unknown cookie value and falls back to the header", async () => {
    expect(
      await extractLocaleFromRequestAsync(
        request({ "accept-language": "en-GB", cookie: "PARAGLIDE_LOCALE=xx" }),
      ),
    ).toBe("en-GB");
  });

  it("falls back to the base locale for unsupported languages", async () => {
    expect(await extractLocaleFromRequestAsync(request({ "accept-language": "fr" }))).toBe("sv");
    expect(await extractLocaleFromRequestAsync(request({}))).toBe("sv");
  });
});
