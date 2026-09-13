import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { registerAcceptLanguageStrategy } from "@/lib/locale-strategy";
import { paraglideMiddleware } from "./paraglide/server.js";

registerAcceptLanguageStrategy();

export default createServerEntry({
  fetch(request) {
    return paraglideMiddleware(request, async (context) => {
      return handler.fetch(context.request);
    });
  },
});
