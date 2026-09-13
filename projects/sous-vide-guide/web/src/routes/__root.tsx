/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SiteHeader } from "@/components/site-header";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { Locale } from "@/paraglide/runtime";
import appCss from "@/styles/app.css?url";

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
  unit: z.enum(["c", "f"]).optional().catch(undefined),
});

export const Route = createRootRouteWithContext<{ locale: Locale }>()({
  validateSearch: rootSearchSchema,
  search: {
    middlewares: [retainSearchParams(["unit"])],
  },
  beforeLoad: async () => {
    // Locale is ALS-scoped by paraglideMiddleware + custom Accept-Language strategy.
    return { locale: getLocale() };
  },
  head: (ctx) => {
    const locale = ctx.match.context.locale;
    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        { title: m.app_name() },
        { name: "description", content: m.home_intro() },
        { property: "og:site_name", content: m.app_name() },
        { property: "og:locale", content: ogLocale(locale) },
        { name: "theme-color", content: "#8a5a2b" },
      ],
      links: [{ rel: "stylesheet", href: appCss }],
    };
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
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
