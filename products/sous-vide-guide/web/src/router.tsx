import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { baseLocale } from "./paraglide/runtime";
import type { Locale } from "./paraglide/runtime";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "viewport",
    scrollRestoration: true,
    context: {
      locale: baseLocale as Locale,
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
