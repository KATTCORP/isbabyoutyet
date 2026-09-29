// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SiteHeader } from "@/components/site-header";
import { setLocaleInPlace } from "@/lib/paraglide-setup";
import { temperatureUnitSearchSchema, unitSearchMiddleware } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";
import { TooltipProvider } from "@workspace/ui/components/tooltip";

function usingCleanup(dispose: () => void): Disposable {
  return {
    [Symbol.dispose]() {
      dispose();
    },
  };
}

function matchMediaResource() {
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  return usingCleanup(() => {
    if (previous) {
      Object.defineProperty(window, "matchMedia", previous);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
}

const rootRoute = createRootRoute({
  beforeLoad: () => ({ locale: getLocale() }),
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <SiteHeader />
        <Outlet />
      </TooltipProvider>
    </ThemeProvider>
  ),
  search: { middlewares: [unitSearchMiddleware(getLocale)] },
  validateSearch: z.object({ unit: temperatureUnitSearchSchema }),
});
const indexRoute = createRoute({
  component: () => (
    <main>{indexRoute.useRouteContext({ select: (context) => context.locale })}</main>
  ),
  getParentRoute: () => rootRoute,
  path: "/",
});

async function renderHeader(initialUrl = "/") {
  cleanup();
  const jsdomWindow = stubJsdomWindow();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
  return {
    router,
    scrollTo: jsdomWindow.scrollTo,
    [Symbol.dispose]() {
      cleanup();
      jsdomWindow[Symbol.dispose]();
    },
  };
}

describe("SiteHeader theme toggle", () => {
  it("exposes the shared light / dark / system mode toggle", async () => {
    await using _matchMedia = matchMediaResource();
    await using _view = await renderHeader();

    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeTruthy();
  });
});

describe("SiteHeader unit and language scroll", () => {
  it("does not reset scroll when switching temperature unit", async () => {
    await using _matchMedia = matchMediaResource();
    await using header = await renderHeader("/");
    header.scrollTo.mockClear();

    fireEvent.click(screen.getByRole("link", { name: m.unit_fahrenheit_short() }));
    await vi.waitFor(() => {
      expect(header.router.state.location.search.unit).toBe("f");
    });
    expect(header.scrollTo).not.toHaveBeenCalled();
  });

  it("leaves ?unit= out of the URL for the locale's default unit", async () => {
    await using _matchMedia = matchMediaResource();
    await using header = await renderHeader("/?unit=f");

    fireEvent.click(screen.getByRole("link", { name: m.unit_celsius_short() }));
    await vi.waitFor(() => {
      expect(header.router.state.location.href).toBe("/");
    });
  });

  it("switches language in place without scrolling or a default ?unit=", async () => {
    await using _matchMedia = matchMediaResource();
    const previousLocale = getLocale();
    await using _restore = usingCleanup(() => {
      void setLocaleInPlace(previousLocale);
    });
    await using header = await renderHeader("/?unit=c");
    header.scrollTo.mockClear();

    fireEvent.click(screen.getByRole("button", { name: m.language() }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /US/i }));
    await vi.waitFor(() => {
      expect(screen.getByRole("main").textContent).toBe("en-US");
    });
    expect(header.router.state.location.href).toBe("/");
    expect(header.scrollTo).not.toHaveBeenCalled();
  });
});
