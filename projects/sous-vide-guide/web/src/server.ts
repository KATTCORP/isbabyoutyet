import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { withCdnCache } from "@/lib/cdn-cache";
import { takeLocaleCacheKey } from "@/lib/locale-cache-key";
import { registerAcceptLanguageStrategy } from "@/lib/locale-strategy";
import { paraglideMiddleware } from "./paraglide/server.js";

registerAcceptLanguageStrategy();

export default createServerEntry({
  fetch(request) {
    const cacheKey = takeLocaleCacheKey(request);
    return paraglideMiddleware(cacheKey.request, async (context) => {
      const response = await handler.fetch(context.request);
      return withCdnCache(response, {
        keyedLocale: cacheKey.locale,
        locale: context.locale,
        request: cacheKey.request,
      });
    });
  },
});
