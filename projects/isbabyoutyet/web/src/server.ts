import "./instrument.server";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { wrapFetchWithSentry } from "@workspace/sentry/server";
import { paraglideMiddleware } from "./paraglide/server.js";
import { finishCaching } from "./lib/cache";
import { takePersonalCacheKey } from "./lib/personal-cache-key";

export default createServerEntry(
  wrapFetchWithSentry({
    async fetch(incoming) {
      const { personal, request } = takePersonalCacheKey(incoming);
      const response = await paraglideMiddleware(request, () => handler.fetch(request));
      return finishCaching(response, { personal, request });
    },
  }),
);
