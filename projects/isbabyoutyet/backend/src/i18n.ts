export const SUPPORTED_LOCALES = ["en-GB", "en-US", "sv", "es", "pt-BR"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-GB";

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.some((supportedLocale) => supportedLocale === locale);
}

/**
 * Resolve a browser language tag to an app locale. English without an
 * explicit US region uses British English, which is also the fallback.
 */
export function resolveSupportedLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  const normalized = locale.replace("_", "-").toLowerCase();
  if (normalized === "en-us" || normalized.startsWith("en-us-")) {
    return "en-US";
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en-GB";
  }
  if (normalized === "sv" || normalized.startsWith("sv-")) {
    return "sv";
  }
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es";
  }
  if (normalized === "pt" || normalized.startsWith("pt-")) {
    return "pt-BR";
  }
  return DEFAULT_LOCALE;
}
