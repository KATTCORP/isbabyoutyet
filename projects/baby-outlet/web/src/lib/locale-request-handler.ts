import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { isSupportedLocale } from "@baby-outlet/backend/src/i18n";
import { resolveAcceptLanguage } from "./accept-language";

type LocaleRequestDeps = {
  readHeader: (name: string) => string | undefined;
  readCookie: (name: string) => string | undefined;
};

export function detectLocaleFromRequestHeaders(
  _serverContext: unknown = undefined,
  deps: LocaleRequestDeps | undefined = undefined,
) {
  const readHeader = deps?.readHeader ?? getRequestHeader;
  const readCookie = deps?.readCookie ?? getCookie;
  const savedLocale = readCookie("PARAGLIDE_LOCALE");
  if (savedLocale && isSupportedLocale(savedLocale)) {
    return savedLocale;
  }
  return resolveAcceptLanguage(readHeader("accept-language") ?? null);
}
