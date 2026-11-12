/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useMatch,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";
import { legacyPolyfillsHeadScripts } from "@workspace/browser-support/head";
import type { AppQueryClient } from "@/lib/query-client";
import type { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import appCss from "../../../../../packages/ui/src/styles/globals.css?url";
import typeCss from "@/styles/app.css?url";
import motifCss from "@/styles/theme-motifs.css?url";
import nunitoCss from "@fontsource-variable/nunito/index.css?url";
import { Analytics } from "@vercel/analytics/react";
import { Progress } from "@workspace/ui/components/progress";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { BabyIcon, IconContext } from "@phosphor-icons/react";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { LocaleProvider, getDetectedLocale, translate, useI18n } from "@/lib/i18n";
import { DevBar } from "@/components/dev-bar";
import { TanStackAppDevtools } from "@/components/tanstack-devtools";
import { m } from "@/paraglide/messages";
import "@/lib/register-service-worker";
import { privateCacheHeaders } from "@/lib/cachePolicy";
import { useDelayedBoolean } from "@/lib/use-delayed-action";

/** What the router gives every route (`getRouter`). */
export type RouterContext = {
  convexClient: ConvexReactClient;
  /** The visitor's language (`visitorLocale`); in the browser, the one the server rendered. */
  locale: SupportedLocale;
  queryClient: AppQueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  head: (opts) => {
    const locale = opts.match.context.locale ?? getDetectedLocale();
    const description = translate(
      locale,
      "Track the progress of labour and birth – know when baby arrives!",
    );
    const title = m.app_name({}, { locale });
    return {
      links: [
        {
          href: nunitoCss,
          rel: "stylesheet",
        },
        {
          href: appCss,
          rel: "stylesheet",
        },
        {
          href: typeCss,
          rel: "stylesheet",
        },
        {
          href: motifCss,
          rel: "stylesheet",
        },
        {
          href: "/apple-touch-icon.png",
          rel: "apple-touch-icon",
        },
        {
          href: "/favicon-32x32.png",
          rel: "icon",
          sizes: "32x32",
          type: "image/png",
        },
        {
          href: "/favicon-16x16.png",
          rel: "icon",
          sizes: "16x16",
          type: "image/png",
        },
      ],
      meta: [
        {
          // HTML meta charset is the IANA name `utf-8`, not Node's `utf8`.
          // oxlint-disable-next-line unicorn/text-encoding-identifier-case
          charSet: "utf-8",
        },
        {
          content: "width=device-width, initial-scale=1",
          name: "viewport",
        },
        {
          title,
        },
        {
          content: description,
          name: "description",
        },
        {
          content: locale.replace("-", "_"),
          property: "og:locale",
        },
        {
          content: title,
          property: "og:site_name",
        },
        {
          content: "website",
          property: "og:type",
        },
        {
          content: "summary_large_image",
          name: "twitter:card",
        },
        {
          content: "#f1840b",
          name: "theme-color",
        },
        {
          content: "yes",
          name: "mobile-web-app-capable",
        },
        {
          content: "yes",
          name: "apple-mobile-web-app-capable",
        },
        {
          content: "black-translucent",
          name: "apple-mobile-web-app-status-bar-style",
        },
      ],
      scripts: legacyPolyfillsHeadScripts(),
    };
  },
  headers() {
    return privateCacheHeaders();
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

/**
 * The document's language: the baby's on a baby page, the signed-in
 * profile's on the dashboard, the visitor's everywhere else. A baby page's
 * manager overlays keep the baby's.
 *
 * @internal exported for tests
 */
export function documentLocale(locales: {
  baby: SupportedLocale | undefined;
  profile: SupportedLocale | undefined;
  visitor: SupportedLocale;
}) {
  return locales.baby ?? locales.profile ?? locales.visitor;
}

// Convex auth on the browser client is owned by `setClientToken` (router
// `hydrate`, login, signup) and `clearClientToken` (sign-out) — no
// `ConvexBetterAuthProvider`. Two `setAuth` owners on one client can strand a
// stopped socket, and the provider flips the identity to anonymous while its
// session store settles on every signed-in page load.
function RootComponent() {
  const context = useRouteContext({ from: Route.id });
  const locale = documentLocale({
    baby: useMatch({
      from: "/baby/$publicId",
      select: (match) => match.loaderData?.babyDoc.resolvedLocale,
      shouldThrow: false,
    }),
    profile: useMatch({
      from: "/_auth",
      select: (match) => match.loaderData?.locale,
      shouldThrow: false,
    }),
    visitor: context.locale,
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Phosphor icons render in the two-tone "duotone" style app-wide */}
      <IconContext.Provider value={{ weight: "duotone" }}>
        <TooltipProvider>
          <LocaleProvider locale={locale}>
            <RootDocument locale={locale}>
              <Outlet />
            </RootDocument>
          </LocaleProvider>
        </TooltipProvider>
      </IconContext.Provider>
    </ThemeProvider>
  );
}

// Router-wide error fallback (registered as defaultErrorComponent): residual
// failures — expired sessions, stale deploys, dropped connections — land here
// instead of TanStack's raw default, and a full reload re-resolves everything
// from a clean slate.
export function RootErrorComponent(props: { error: unknown }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background bg-dots flex items-center justify-center px-6">
      <div className="text-center space-y-5 max-w-md rounded-[2rem] border-2 border-border bg-card p-10 pop-shadow">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20">
          <BabyIcon className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-black text-foreground">{t("Something went wrong")}</h1>
        <p className="text-muted-foreground font-medium">
          {t("An unexpected error occurred. Reloading usually fixes it.")}
        </p>
        {import.meta.env.DEV ? (
          <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
            {props.error instanceof Error ? props.error.message : String(props.error)}
          </pre>
        ) : null}
        <div className="flex justify-center gap-3">
          <Button
            className="rounded-full"
            onClick={() => {
              window.location.reload();
            }}
            size="lg"
          >
            {t("Reload page")}
          </Button>
          <Button
            className="rounded-full"
            nativeButton={false}
            render={<Link to="/" />}
            size="lg"
            variant="outline"
          >
            {t("Go Home")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background bg-dots flex items-center justify-center px-6">
      <div className="text-center space-y-5 max-w-md rounded-[2rem] border-2 border-border bg-card p-10 pop-shadow">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20">
          <BabyIcon className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-6xl font-black text-foreground">404</h1>
        <h2 className="text-2xl font-black text-foreground">{t("Not arrived yet!")}</h2>
        <p className="text-muted-foreground font-medium">
          {t("Looks like this page hasn't arrived yet. Let's get you back home!")}
        </p>
        <Button className="rounded-full" nativeButton={false} render={<Link to="/" />} size="lg">
          {t("Go Home")}
        </Button>
      </div>
    </div>
  );
}

// The router flips isLoading true on every navigation — including instant
// ones served entirely from the React Query cache — so an undelayed bar
// flashes on every click and makes fast navigations look slow. Only show it
// once loading has persisted past this threshold (same idea as TanStack's
// defaultPendingMs for pending components).
export const NAVIGATION_PROGRESS_DELAY_MS = 200;

// Global pending indicator: the URL updates immediately on navigation, but on
// slow connections the next page's chunks/loaders can take a while — without
// this the app looks frozen. SPAs can't trigger the browser's native loading
// indicator, so we show a top progress bar while the router is loading.
// value={null} puts Progress in its indeterminate (sweeping) state.
export function NavigationProgress() {
  const isNavigating = useRouterState({ select: (state) => state.isLoading });
  return <NavigationProgressBar isNavigating={isNavigating} />;
}

/**
 * Presentational progress bar. `isNavigating` is a prop so tests can drive the
 * delay/hide behaviour without mocking `useRouterState`.
 *
 * @internal exported for tests
 */
export function NavigationProgressBar(props: { isNavigating: boolean }) {
  const { t } = useI18n();
  const showBar = useDelayedBoolean({
    delayMs: NAVIGATION_PROGRESS_DELAY_MS,
    value: props.isNavigating,
  });

  if (!showBar) {
    return null;
  }
  return (
    <Progress
      aria-label={t("Loading")}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50",
        "[&_[data-slot=progress-indicator]]:w-1/4 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:animate-progress-indeterminate",
        "motion-reduce:[&_[data-slot=progress-indicator]]:w-full motion-reduce:[&_[data-slot=progress-indicator]]:animate-none",
      )}
      value={null}
    />
  );
}

/** @internal exported for tests — document shell without Convex/auth providers. */
export function RootDocument(props: { children: ReactNode; locale: SupportedLocale }) {
  // Inlined env gate (not `hasDemoLogin`) so Vite DCE drops DevBar and
  // TanStack Devtools in prod. Same expression as the Vite strip flag:
  // preview sets VITE_HAS_DEMO_LOGIN; production leaves it unset.
  const showPreviewDevTools = import.meta.env.DEV || import.meta.env.VITE_HAS_DEMO_LOGIN === "true";
  return (
    // next-themes sets the theme class and color-scheme on <html> before React
    // loads, so those attributes legitimately differ from the server HTML.
    <html dir="ltr" lang={props.locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <NavigationProgress />
        {props.children}
        {showPreviewDevTools ? <DevBar /> : null}
        <Toaster />
        <Analytics />
        {showPreviewDevTools ? <TanStackAppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
