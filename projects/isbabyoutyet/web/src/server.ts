import "./instrument.server";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import { paraglideMiddleware } from "./paraglide/server.js";
import { applyCachePolicy } from "./lib/cachePolicy";

export default createServerEntry(
  wrapFetchWithSentry({
    async fetch(request) {
      const response = await paraglideMiddleware(request, () => handler.fetch(request));
      return applyCachePolicy(request, response);
    },
  }),
);
