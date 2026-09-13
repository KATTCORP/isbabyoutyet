import { mapAcceptLanguage, mapLanguageTag } from "@/lib/map-language-tag";
import type { Locale } from "@/paraglide/runtime";

export { mapLanguageTag };

/** Resolve a locale from Accept-Language for the custom Paraglide strategy. */
export function localeFromAcceptLanguageHeader(
  header: string | null | undefined,
): Locale | undefined {
  return mapAcceptLanguage(header) ?? undefined;
}
