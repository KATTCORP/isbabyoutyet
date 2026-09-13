/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SiteHeader } from "@/components/site-header";
import { temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";
import appCss from "@/styles/app.css?url";
import { Toaster } from "@workspace/ui/components/sonner";

function ogLocale(locale: Locale) {
  switch (locale) {
    case "sv":
      return "sv_SE";
    case "en-GB":
      return "en_GB";
    case "en-US":
      return "en_US";
    default: {
      const _exhaustive: never = locale;
      return _exhaustive;
    }
  }
}

const rootSearchSchema = z.object({
  unit: temperatureUnitSearchSchema,
});

export const Route = createRootRouteWithContext<{ locale: Locale }>()({
  beforeLoad: async () => {
    // Locale is ALS-scoped by paraglideMiddleware + custom Accept-Language strategy.
    return { locale: getLocale() };
  },
  component: RootComponent,
  head: (ctx) => {
    const locale = ctx.match.context.locale;
    return {
      links: [{ href: appCss, rel: "stylesheet" }],
      meta: [
        { charSet: "utf8" },
        {
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
          name: "viewport",
        },
        { title: m.app_name() },
        { content: m.sous_vide_summary(), name: "description" },
        { content: m.app_name(), property: "og:site_name" },
        { content: ogLocale(locale), property: "og:locale" },
        { content: "#8a5a2b", name: "theme-color" },
      ],
    };
  },
  notFoundComponent: NotFoundComponent,
  search: {
    middlewares: [retainSearchParams(["unit"])],
  },
  validateSearch: rootSearchSchema,
});

function RootComponent() {
  const { locale } = Route.useRouteContext();

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        <Outlet />
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{m.app_name()}</h1>
      <p className="mt-2 text-muted-foreground">{m.guides_empty()}</p>
    </main>
  );
}
