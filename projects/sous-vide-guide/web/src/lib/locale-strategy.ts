import { mapAcceptLanguage, mapLanguageTag } from "@/lib/map-language-tag";
import {
  cookieName,
  defineCustomClientStrategy,
  defineCustomServerStrategy,
  isServer,
} from "@/paraglide/runtime";

const STRATEGY = "custom-acceptLanguage";

let registered = false;

const localeCookiePattern = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`);

function readLocaleCookie(cookieHeader: string | null | undefined) {
  const match = cookieHeader?.match(localeCookiePattern);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

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
      // Paraglide runs custom server strategies before the built-in cookie
      // strategy, so honor an explicit locale choice here before the header.
      const fromCookie = mapLanguageTag(readLocaleCookie(request?.headers.get("cookie")) ?? "");
      return fromCookie ?? mapAcceptLanguage(request?.headers.get("accept-language")) ?? undefined;
    },
  });

  defineCustomClientStrategy(STRATEGY, {
    getLocale: () => {
      // Node ships a `navigator` too (always en-US); only the browser's languages count.
      if (isServer) {
        return undefined;
      }
      const languages: ReadonlyArray<string> = globalThis.navigator?.languages ?? [];
      for (const tag of languages) {
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
