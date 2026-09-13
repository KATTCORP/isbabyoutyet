import { mapAcceptLanguage, mapLanguageTag } from "@/lib/map-language-tag";
import { defineCustomClientStrategy, defineCustomServerStrategy } from "@/paraglide/runtime";

const STRATEGY = "custom-acceptLanguage";

let registered = false;

/**
 * Register Accept-Language mapping used by both SSR and the browser.
 * Must not import `.server` modules — Vite import-protection mocks those on the client
 * and would otherwise resolve locale to `[import-protection mock]`.
 */
export function registerAcceptLanguageStrategy() {
  if (registered) {
    return;
  }
  registered = true;

  defineCustomServerStrategy(STRATEGY, {
    getLocale: (request) => {
      return mapAcceptLanguage(request?.headers.get("accept-language")) ?? undefined;
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
