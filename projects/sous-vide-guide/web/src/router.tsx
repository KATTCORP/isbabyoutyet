import {
  addIntegration,
  captureException,
  tanstackRouterBrowserTracingIntegration,
} from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";

import "@/lib/paraglide-setup";
import { hashScrollIntoViewOptions } from "@/lib/hash-scroll";
import { registerAcceptLanguageStrategy } from "@/lib/locale-strategy";
import { routeTree } from "./routeTree.gen";
import { baseLocale } from "./paraglide/runtime";

registerAcceptLanguageStrategy();

export function getRouter() {
  const router = createRouter({
    context: {
      locale: baseLocale,
    },
    // Category / cut `#hash` Links use scrollIntoView — see hash-scroll.ts.
    defaultHashScrollIntoView: hashScrollIntoViewOptions(),
    defaultOnCatch: (error) => {
      captureException(error);
    },
    defaultPreload: "viewport",
    routeTree,
    scrollRestoration: true,
  });
  if (!router.isServer) {
    addIntegration(tanstackRouterBrowserTracingIntegration(router));
  }
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
