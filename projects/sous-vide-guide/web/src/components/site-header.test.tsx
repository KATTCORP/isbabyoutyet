// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

async function renderHeader() {
  cleanup();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
  return usingCleanup(() => {
    cleanup();
  });
}

describe("SiteHeader theme toggle", () => {
  it("exposes the shared light / dark / system mode toggle", async () => {
    await using _matchMedia = matchMediaResource();
    await using _view = await renderHeader();

    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeTruthy();
  });
});
