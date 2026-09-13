import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@baby-outlet/backend/src/i18n";

const SUPPORTED_BASE_LANGUAGES = new Set(
  SUPPORTED_LOCALES.map((locale) => locale.split("-")[0]?.toLowerCase()),
);

export function resolveAcceptLanguage(acceptLanguage: string | null): SupportedLocale {
  for (const preference of acceptLanguage?.split(",") ?? []) {
    const languageTag = preference.split(";")[0]?.trim();
    if (!languageTag) {
      continue;
    }
    const baseLanguage = languageTag.split("-")[0]?.toLowerCase();
    if (baseLanguage && SUPPORTED_BASE_LANGUAGES.has(baseLanguage)) {
      return resolveSupportedLocale(languageTag);
    }
  }
  return DEFAULT_LOCALE;
}
