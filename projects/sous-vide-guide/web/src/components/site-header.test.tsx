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
import { temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
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
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <SiteHeader />
        <Outlet />
      </TooltipProvider>
    </ThemeProvider>
  ),
});
const indexRoute = createRoute({
  component: () => null,
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: z.object({ unit: temperatureUnitSearchSchema }),
});

async function renderHeader(initialUrl = "/") {
  cleanup();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
  return {
    router,
    [Symbol.dispose]() {
      cleanup();
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
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await using _scrollTo = usingCleanup(() => {
      scrollTo.mockRestore();
    });
    await using header = await renderHeader("/?unit=c");
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole("link", { name: m.unit_fahrenheit_short() }));
    await vi.waitFor(() => {
      expect(header.router.state.location.search.unit).toBe("f");
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not reset scroll when switching language", async () => {
    await using _matchMedia = matchMediaResource();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await using _scrollTo = usingCleanup(() => {
      scrollTo.mockRestore();
    });
    await using header = await renderHeader("/?unit=c");
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole("button", { name: m.language() }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /US/i }));
    await vi.waitFor(() => {
      expect(header.router.state.location.search.unit).toBe("f");
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
