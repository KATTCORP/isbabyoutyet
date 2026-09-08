import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import "@/lib/paraglide-setup";
import { getLocale } from "@/paraglide/runtime";
import {
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@workspace/convex/src/i18n";
import {
  translate,
  type TranslationArguments,
  type TranslationFunction,
  type TranslationKey,
} from "@/lib/i18n-catalog";

export type { TranslationFunction, TranslationKey } from "@/lib/i18n-catalog";
export { getLanguageName, splitMessageList, translate } from "@/lib/i18n-catalog";

/**
 * Paraglide owns request-safe locale detection. Cookie persistence is only for
 * an explicit profile language choice (see paraglide-setup) — not the first
 * browser sniff — so Accept-Language / Locale Switcher keep working. Product UI
 * copy lives in `apps/web/messages/{locale}.json` (same files Paraglide
 * compiles). This provider accepts an explicit locale because a public baby
 * page can override the visitor's cookie without changing that visitor's own
 * preference.
 */
const LocaleContext = createContext<SupportedLocale>(DEFAULT_LOCALE);

export function LocaleProvider(props: { children: ReactNode; locale: SupportedLocale }) {
  return <LocaleContext value={props.locale}>{props.children}</LocaleContext>;
}

export function getDetectedLocale() {
  return resolveSupportedLocale(getLocale());
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (<TKey extends TranslationKey>(key: TKey, ...args: TranslationArguments<TKey>) =>
      translate(locale, key, ...args)) satisfies TranslationFunction,
  };
}
