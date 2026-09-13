import { locales } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";

function isLocale(value: string): value is Locale {
  return (locales as ReadonlyArray<string>).includes(value);
}

/**
 * Maps a BCP 47 language tag onto an app locale.
 * Bare `en` and non-US English region tags resolve to British English.
 */
export function mapLanguageTag(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized === "en-us") {
    return "en-US";
  }
  if (normalized === "en-gb" || normalized === "en") {
    return "en-GB";
  }
  if (isLocale(normalized)) {
    return normalized;
  }

  const language = normalized.split("-")[0];
  if (language === "en") {
    return "en-GB";
  }
  if (language && isLocale(language)) {
    return language;
  }
  return null;
}

/** Parse an Accept-Language header, honoring q-values (highest first). */
export function mapAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) {
    return null;
  }

  const preferences = header
    .split(",")
    .map((part) => {
      const [tagPart, ...params] = part.trim().split(";");
      const tag = tagPart?.trim() ?? "";
      let quality = 1;
      for (const param of params) {
        const [key, value] = param.trim().split("=");
        if (key === "q" && value) {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) {
            quality = parsed;
          }
        }
      }
      return { tag, quality };
    })
    .filter((preference) => preference.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const preference of preferences) {
    const locale = mapLanguageTag(preference.tag);
    if (locale) {
      return locale;
    }
  }
  return null;
}
