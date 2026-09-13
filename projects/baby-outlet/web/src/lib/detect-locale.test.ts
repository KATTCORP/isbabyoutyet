import { expect, test } from "vitest";
import { resolveAcceptLanguage } from "./accept-language";
import { detectRequestLocale } from "./detect-locale";
import { getLanguageName, translate } from "./i18n";
import { detectLocaleFromRequestHeaders } from "./locale-request-handler";

test.each([
  ["sv-SE,sv;q=0.9,en;q=0.7", "sv"],
  ["es-MX,es;q=0.9", "es"],
  ["pt-BR,pt;q=0.9", "pt-BR"],
  ["pt-PT,pt;q=0.9", "pt-BR"],
  ["en-US,en;q=0.9", "en-US"],
  ["en-AU,en;q=0.9", "en-GB"],
  ["fr-FR,es;q=0.8", "es"],
  ["fr-FR,fr;q=0.9", "en-GB"],
  ["", "en-GB"],
  [null, "en-GB"],
] as const)("resolves Accept-Language %s to %s", (header, expected) => {
  expect(resolveAcceptLanguage(header)).toBe(expected);
});

test("displays supported language names in the active language", () => {
  expect(getLanguageName("sv", "es").toLocaleLowerCase("es")).toContain("sueco");
});

test("keeps British and American English copy distinct", () => {
  expect(translate("en-GB", "Gone to hospital")).toBe("Gone to hospital");
  expect(translate("en-US", "Gone to hospital")).toBe("Gone to the hospital");
  expect(translate("en-US", "Track the progress of labour and birth")).toBe(
    "Follow labor and birth",
  );
  expect(
    translate(
      "en-US",
      "Pick a theme that matches your style. From soft pastels to bold colours — your page, your vibe.",
    ),
  ).toBe("Pick soft pastels, bold colors or whatever feels like you.");
});

test("reads Accept-Language from the current request", () => {
  expect(
    detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => undefined,
      readHeader: () => "es-ES,es;q=0.9",
    }),
  ).toBe("es");
});

test("a saved locale takes precedence over Accept-Language", () => {
  expect(
    detectLocaleFromRequestHeaders(undefined, {
      readCookie: () => "sv",
      readHeader: () => "en-GB,en;q=0.9",
    }),
  ).toBe("sv");
});

test("registers the request locale server function", () => {
  expect(detectRequestLocale).toEqual(expect.any(Function));
});
