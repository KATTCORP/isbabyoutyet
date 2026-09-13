import { getCookie, getRequestHeader } from "@tanstack/react-start/server";

import { baseLocale, cookieName, locales } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";

type LocaleRequestDeps = {
  readHeader: (name: string) => string | undefined;
  readCookie: (name: string) => string | undefined;
};

function isLocale(value: string): value is Locale {
  return (locales as ReadonlyArray<string>).includes(value);
}

function localeFromAcceptLanguage(header: string | undefined) {
  if (!header) {
    return null;
  }
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0]?.toLowerCase();
    if (!tag) {
      continue;
    }
    if (isLocale(tag)) {
      return tag;
    }
    const language = tag.split("-")[0];
    if (language && isLocale(language)) {
      return language;
    }
  }
  return null;
}

export function detectLocaleFromRequestHeaders(
  _serverContext: unknown = undefined,
  deps: LocaleRequestDeps | undefined = undefined,
) {
  const readHeader = deps?.readHeader ?? getRequestHeader;
  const readCookie = deps?.readCookie ?? getCookie;
  const saved = readCookie(cookieName);
  if (saved && isLocale(saved)) {
    return saved;
  }
  return localeFromAcceptLanguage(readHeader("accept-language")) ?? baseLocale;
}
