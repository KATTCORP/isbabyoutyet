import { localeFromAcceptLanguageHeader, mapLanguageTag } from "@/lib/detect-locale.server";
import { defineCustomClientStrategy, defineCustomServerStrategy } from "@/paraglide/runtime";

const STRATEGY = "custom-acceptLanguage";

let registered = false;

/** Register Accept-Language mapping used by both SSR and the browser. */
export function registerAcceptLanguageStrategy() {
  if (registered) {
    return;
  }
  registered = true;

  defineCustomServerStrategy(STRATEGY, {
    getLocale: (request) => {
      return localeFromAcceptLanguageHeader(request?.headers.get("accept-language"));
    },
  });

  defineCustomClientStrategy(STRATEGY, {
    getLocale: () => {
      if (typeof navigator === "undefined") {
        return undefined;
      }
      for (const tag of navigator.languages ?? [navigator.language]) {
        const locale = mapLanguageTag(tag);
        if (locale) {
          return locale;
        }
      }
      return undefined;
    },
    setLocale: () => {
      // Cookie strategy persists explicit choices; nothing to store here.
    },
  });
}
