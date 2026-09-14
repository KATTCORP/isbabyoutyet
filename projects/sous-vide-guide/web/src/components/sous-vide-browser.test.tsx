// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SousVideBrowser } from "@/components/sous-vide-browser";
import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { filterSousVideEntries } from "@/lib/search";
import { temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";

const ENTRIES = getSousVideEntries(createContentT("en-GB"));

// Mirrors the wiring in routes/index.tsx without the SSR-only root document.
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  component: GuidePage,
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: z.object({
    info: z.string().default(""),
    q: z.string().default(""),
    unit: temperatureUnitSearchSchema,
  }),
});

function GuidePage() {
  const search = indexRoute.useSearch();
  const entries = filterSousVideEntries({ entries: ENTRIES, query: search.q });
  return (
    <SousVideBrowser
      allEntries={ENTRIES}
      entries={entries}
      info={search.info}
      q={search.q}
      unit={search.unit ?? "c"}
    />
  );
}

async function renderGuide(initialUrl: string) {
  cleanup();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });
  const view = render(<RouterProvider router={router} />);
  // An open `?info=` drawer aria-hides the page chrome; still wait on the field.
  await screen.findByRole("searchbox", { hidden: true });
  return { router, view };
}

function cardById(id: string) {
  const card = document.getElementById(id);
  if (card === null) {
    throw new Error(`No card with id "${id}"`);
  }
  return card;
}

function currentQuery(router: Awaited<ReturnType<typeof renderGuide>>["router"]) {
  return router.state.location.search.q ?? "";
}

describe("SousVideBrowser", () => {
  it("renders one section per category with one card per cut", async () => {
    const guide = await renderGuide("/");

    const pork = document.getElementById("pork");
    expect(pork).not.toBeNull();
    expect(document.querySelectorAll("section[id]")).toHaveLength(8);

    const porkFillet = document.getElementById("pork-fillet");
    expect(porkFillet).not.toBeNull();
    expect(porkFillet?.querySelectorAll("ol > li")).toHaveLength(3);
    expect(document.getElementById("duck-breast")?.querySelectorAll("ol > li")).toHaveLength(1);

    const dock = screen.getByRole("navigation", { name: m.jump_to_category() });
    const quickLinks = within(dock).getAllByRole("link");
    expect(quickLinks).toHaveLength(8);
    expect(quickLinks[0]?.getAttribute("href")).toBe("/#pork");

    guide.view.unmount();
  });

  it("keeps category titles sticky so Fish stays visible while browsing that section", async () => {
    const guide = await renderGuide("/");

    const fish = document.getElementById("fish");
    expect(fish).not.toBeNull();
    const heading = fish?.querySelector("h2");
    expect(heading?.className).toContain("sticky");
    expect(heading?.className).toContain("top-[var(--site-header-h)]");

    guide.view.unmount();
  });

  it("filters as you type, writes ?q= and shows ranked results instead of sections", async () => {
    const guide = await renderGuide("/");
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "salmon" } });
    await act(async () => {
      await guide.router.invalidate();
    });

    expect(currentQuery(guide.router)).toBe("salmon");
    expect(document.getElementById("pork")).toBeNull();
    expect(document.getElementById("salmon")).not.toBeNull();
    expect(screen.getAllByText(m.results_for_query({ count: 3, query: "salmon" })).length).toBe(2);
    expect(within(cardById("salmon")).getByText(m.category_fish())).toBeDefined();

    guide.view.unmount();
  });

  it("ignores a single keystroke and shows the empty state for no matches", async () => {
    const guide = await renderGuide("/?q=p");
    expect(document.querySelectorAll("section[id]")).toHaveLength(8);
    guide.view.unmount();

    const empty = await renderGuide("/?q=zzzz");
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(screen.getAllByText(m.no_results()).length).toBe(2);
    empty.view.unmount();
  });

  it("clears the field and restores the sections", async () => {
    const guide = await renderGuide("/?q=salmon");
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    expect(input.value).toBe("salmon");

    fireEvent.click(screen.getByRole("button", { name: m.clear_search() }));
    await act(async () => {
      await guide.router.invalidate();
    });

    expect(currentQuery(guide.router)).toBe("");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(document.getElementById("pork")).not.toBeNull();

    guide.view.unmount();
  });

  it("blurs the field on submit instead of navigating", async () => {
    const guide = await renderGuide("/?q=salmon");
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.submit(screen.getByRole("search"));

    expect(document.activeElement).not.toBe(input);
    expect(currentQuery(guide.router)).toBe("salmon");
    guide.view.unmount();
  });

  it("formats temperatures in the unit from the URL", async () => {
    const guide = await renderGuide("/?unit=f");
    const duck = cardById("duck-breast");
    expect(within(duck).getByText(/°F$/)).toBeDefined();
    expect(within(duck).queryByText(/°C$/)).toBeNull();
    guide.view.unmount();
  });

  it("shows a fridge-start label on egg cards", async () => {
    const guide = await renderGuide("/");
    const eggCard = cardById("egg");
    expect(within(eggCard).getByText(m.start_from_fridge())).toBeTruthy();
    expect(within(cardById("pork-fillet")).queryByText(m.start_from_fridge())).toBeNull();
    guide.view.unmount();
  });

  it("opens egg detail drawer from ?info= and keeps the cut id in the URL", async () => {
    const guide = await renderGuide("/");
    const eggCard = cardById("egg");
    expect(within(eggCard).getByText(m.start_from_fridge())).toBeTruthy();
    fireEvent.click(within(eggCard).getByRole("button", { name: m.more_info() }));
    await vi.waitFor(() => {
      expect(guide.router.state.location.search.info).toBe("egg");
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(m.guide_notes_heading())).toBeTruthy();
    expect(within(dialog).getByText(m.guide_references_heading())).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Anova/i }).getAttribute("href")).toMatch(
      /^https:\/\//,
    );

    fireEvent.click(within(dialog).getByRole("button", { name: m.close_detail() }));
    await vi.waitFor(() => {
      expect(guide.router.state.location.search.info).toBe("");
    });
    guide.view.unmount();
  });

  it("opens the egg detail drawer from a deep link", async () => {
    const guide = await renderGuide("/?info=egg");
    expect(guide.router.state.location.search.info).toBe("egg");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(m.guide_notes_heading())).toBeTruthy();
    guide.view.unmount();
  });
});
