import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { isSupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { resolveAcceptLanguage } from "./accept-language";

type LocaleRequestDeps = {
  readCookie: (name: string) => string | undefined;
  readHeader: (name: string) => string | undefined;
};

/** The live request's cookies and headers. */
const requestDeps: LocaleRequestDeps = { readCookie: getCookie, readHeader: getRequestHeader };

/** The request's locale: the saved `PARAGLIDE_LOCALE` cookie, then `Accept-Language`. */
export function detectLocaleFromRequestHeaders(deps: LocaleRequestDeps = requestDeps) {
  const readHeader = deps.readHeader;
  const readCookie = deps.readCookie;
  const savedLocale = readCookie("PARAGLIDE_LOCALE");
  if (savedLocale && isSupportedLocale(savedLocale)) {
    return savedLocale;
  }
  return resolveAcceptLanguage(readHeader("accept-language") ?? null);
}
