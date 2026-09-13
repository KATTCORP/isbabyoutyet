import { createRouter } from "@tanstack/react-router";

import "@/lib/paraglide-setup";
import { registerAcceptLanguageStrategy } from "@/lib/locale-strategy";
import { routeTree } from "./routeTree.gen";
import { baseLocale } from "./paraglide/runtime";

registerAcceptLanguageStrategy();

export function getRouter() {
  return createRouter({
    context: {
      locale: baseLocale,
    },
    defaultPreload: "viewport",
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
