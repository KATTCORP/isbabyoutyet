import { createIsomorphicFn } from "@tanstack/react-start";
import { getDetectedLocale } from "@/lib/i18n";
import { detectLocaleFromRequestHeaders } from "@/lib/locale-request-handler";

/**
 * The visitor's language when the router is made. On the server it is the
 * request's (the `PARAGLIDE_LOCALE` cookie, then `Accept-Language`), so the
 * document renders in it and the browser doesn't render again. In the
 * browser it is what Paraglide detects; choosing a language reloads the page.
 */
export const visitorLocale = createIsomorphicFn()
  .server(() => detectLocaleFromRequestHeaders())
  .client(() => getDetectedLocale());
