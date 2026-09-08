import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import "@/lib/paraglide-setup";
import { getLocale } from "@/paraglide/runtime";
import {
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@workspace/convex/src/i18n";
import enGBMessages from "../../messages/en-GB.json";
import enUSMessages from "../../messages/en-US.json";
import esMessages from "../../messages/es.json";
import ptBRMessages from "../../messages/pt-BR.json";
import svMessages from "../../messages/sv.json";

/**
 * Paraglide owns request-safe locale detection. Cookie persistence is only for
 * an explicit profile language choice (see paraglide-setup) — not the first
 * browser sniff — so Accept-Language / Locale Switcher keep working. Product UI
 * copy lives in `apps/web/messages/{locale}.json` (same files Paraglide
 * compiles). This catalog accepts an explicit locale because a public baby page
 * can override the visitor's cookie without changing that visitor's own
 * preference.
 */

type MessageCatalogFile = {
  readonly [key: string]: string;
};

/** Strip the inlang schema key; remaining keys are translation message ids. */
function withoutSchema(messages: MessageCatalogFile) {
  const catalog: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (key === "$schema") {
      continue;
    }
    catalog[key] = value;
  }
  return catalog;
}

const enGB = withoutSchema(enGBMessages);
const catalogs = {
  "en-GB": enGB,
  "en-US": withoutSchema(enUSMessages),
  es: withoutSchema(esMessages),
  "pt-BR": withoutSchema(ptBRMessages),
  sv: withoutSchema(svMessages),
} satisfies Record<SupportedLocale, Readonly<Record<string, string>>>;

type SchemaKey = "$schema";
export type TranslationKey = Exclude<keyof typeof enGBMessages, SchemaKey>;

type PlaceholderNames<TKey extends string> =
  TKey extends `${string}{{${infer TName}}}${infer TRest}`
    ? TName | PlaceholderNames<TRest>
    : never;

type TranslationVariables<TKey extends TranslationKey> = {
  [TName in PlaceholderNames<TKey>]: number | string;
};

type TranslationArguments<TKey extends TranslationKey> = [PlaceholderNames<TKey>] extends [never]
  ? []
  : [variables: TranslationVariables<TKey>];

export type TranslationFunction = <TKey extends TranslationKey>(
  key: TKey,
  ...args: TranslationArguments<TKey>
) => string;

const LocaleContext = createContext<SupportedLocale>(DEFAULT_LOCALE);

export function LocaleProvider(props: { children: ReactNode; locale: SupportedLocale }) {
  return <LocaleContext value={props.locale}>{props.children}</LocaleContext>;
}

export function getDetectedLocale() {
  return resolveSupportedLocale(getLocale());
}

export function translate<TKey extends TranslationKey>(
  locale: SupportedLocale,
  key: TKey,
  ...args: TranslationArguments<TKey>
) {
  const variables = args[0] ?? {};
  const fallback = enGB[key];
  if (fallback === undefined) {
    throw new Error(`Missing base translation for ${key}`);
  }
  let message: string = catalogs[locale][key] ?? fallback;
  for (const [name, value] of Object.entries(variables)) {
    message = message.replaceAll(`{{${name}}}`, () => String(value));
  }
  return message;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (<TKey extends TranslationKey>(key: TKey, ...args: TranslationArguments<TKey>) =>
      translate(locale, key, ...args)) satisfies TranslationFunction,
  };
}

export function getLanguageName(locale: SupportedLocale, displayLocale: SupportedLocale = locale) {
  return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
}

/** Split a comma-separated message value into trimmed parts (hero name pools). */
export function splitMessageList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
