// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SousVideBrowser } from "@/components/sous-vide-browser";
import { getSousVideEntries } from "@/data/sousVide";
import { createContentT } from "@/lib/content-t";
import { hashScrollIntoViewOptions } from "@/lib/hash-scroll";
import { infoCutIdFromHash } from "@/lib/info-hash";
import { filterSousVideEntries } from "@/lib/search";
import { temperatureUnitSearchSchema } from "@/lib/temperature";
import { m } from "@/paraglide/messages";
import { stubJsdomWindow } from "@/test/stubJsdomWindow";

const ENTRIES = getSousVideEntries(createContentT("en-GB"));

// Mirrors the wiring in routes/index.tsx without the SSR-only root document.
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  component: GuidePage,
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: z.object({
    q: z.string().default(""),
    unit: temperatureUnitSearchSchema,
  }),
});

function GuidePage() {
  const search = indexRoute.useSearch();
  const info = useLocation({ select: (location) => infoCutIdFromHash(location.hash) });
  const entries = filterSousVideEntries({ entries: ENTRIES, query: search.q });
  return (
    <SousVideBrowser
      allEntries={ENTRIES}
      entries={entries}
      info={info}
      q={search.q}
      unit={search.unit ?? "c"}
    />
  );
}

async function renderGuide(initialUrl: string) {
  cleanup();
  const jsdomWindow = stubJsdomWindow();
  const router = createRouter({
    defaultHashScrollIntoView: hashScrollIntoViewOptions(),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    routeTree: rootRoute.addChildren([indexRoute]),
  });
  render(<RouterProvider router={router} />);
  // An open `#info-…` drawer aria-hides the page chrome; still wait on the field.
  await screen.findByRole("searchbox", { hidden: true });
  return {
    router,
    scrollIntoView: jsdomWindow.scrollIntoView,
    scrollTo: jsdomWindow.scrollTo,
    [Symbol.dispose]() {
      cleanup();
      jsdomWindow[Symbol.dispose]();
    },
  };
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
    using _guide = await renderGuide("/");

    expect(document.querySelectorAll("section[id]")).toHaveLength(8);
    expect(
      document.getElementById("pork-fillet")?.querySelectorAll("ol > li").length,
    ).toBeGreaterThan(1);

    const dock = screen.getByRole("navigation", { name: m.jump_to_category() });
    const quickLinks = within(dock).getAllByRole("link");
    expect(quickLinks).toHaveLength(8);
    expect(quickLinks[0]?.getAttribute("href")).toBe("#pork");
  });

  it("links categories with native in-page anchors and marks the URL-hash match current", async () => {
    using _guide = await renderGuide("/#fish");

    const dock = screen.getByRole("navigation", { name: m.jump_to_category() });
    const current = within(dock)
      .getAllByRole("link")
      .filter((link) => link.hasAttribute("aria-current"));
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["#fish"]);
    expect(current[0]?.getAttribute("aria-current")).toBe("location");

    const permalink = screen.getByRole("link", {
      name: m.category_permalink_label({ category: m.category_fish() }),
    });
    expect(permalink.getAttribute("href")).toBe("#fish");
  });

  it("smooth-scrolls cut permalink hash jumps via scrollIntoView options", async () => {
    using guide = await renderGuide("/");
    const cutLink = cardById("pork-fillet").querySelector<HTMLElement>("h3 a");
    if (cutLink === null) {
      throw new Error("Expected pork fillet permalink");
    }
    fireEvent.click(cutLink);

    await vi.waitFor(() => {
      expect(guide.router.state.location.hash).toBe("pork-fillet");
    });
    await vi.waitFor(() => {
      expect(guide.scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: expect.stringMatching(/^(smooth|instant)$/) }),
      );
    });
  });

  it("keeps category titles sticky so Fish stays visible while browsing that section", async () => {
    using _guide = await renderGuide("/");

    const fish = document.getElementById("fish");
    expect(fish).not.toBeNull();
    // A #fish jump lands the section top at its scroll-margin; the title is the
    // section's first box and sticks at that same line, so it lands flush.
    expect(fish?.className).toContain("scroll-mt-[calc(var(--sticky-chrome-h)-1px)]");
    expect(fish?.className).not.toMatch(/(^|\s)(sm:)?p[ty]-/);
    const heading = fish?.firstElementChild;
    expect(heading?.tagName).toBe("H2");
    expect(heading?.className).toContain("sticky");
    // 1px under sticky chrome + opaque fill so compositing cannot leave a page-bg gap.
    expect(heading?.className).toContain("top-[calc(var(--sticky-chrome-h)-1px)]");
    expect(heading?.className).toContain("bg-background");
    expect(heading?.className).not.toContain("backdrop-blur");

    const dock = screen.getByRole("navigation", { name: m.jump_to_category() });
    expect(dock.className).toContain("bg-background");
    expect(dock.className).not.toContain("backdrop-blur");
  });

  it("puts the gap between sections inside each section so titles hand off flush", async () => {
    using _guide = await renderGuide("/");

    const sections = [...document.querySelectorAll("section[id]")];
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) {
      // Only `first:` may add a top margin; a plain margin between sections
      // leaves a band where neither title is stuck.
      expect(section.className).not.toMatch(/(^|\s)(sm:)?m[ty]-/);
      expect(section.lastElementChild?.className).toContain("pb-7");
    }
  });

  it("filters as you type, writes ?q= and shows ranked results instead of sections", async () => {
    using guide = await renderGuide("/");
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
  });

  it("ignores a single keystroke and shows the empty state for no matches", async () => {
    {
      using _guide = await renderGuide("/?q=p");
      expect(document.querySelectorAll("section[id]")).toHaveLength(8);
    }

    using _empty = await renderGuide("/?q=zzzz");
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(screen.getAllByText(m.no_results()).length).toBe(2);
  });

  it("clears the field and restores the sections", async () => {
    using guide = await renderGuide("/?q=salmon");
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
  });

  it("blurs the field on submit instead of navigating", async () => {
    using guide = await renderGuide("/?q=salmon");
    const input = screen.getByRole<HTMLInputElement>("searchbox");
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.submit(screen.getByRole("search"));

    expect(document.activeElement).not.toBe(input);
    expect(currentQuery(guide.router)).toBe("salmon");
  });

  it("formats temperatures in the unit from the URL", async () => {
    using _guide = await renderGuide("/?unit=f");
    const duck = cardById("duck-breast");
    expect(within(duck).getByText(/°F$/)).toBeDefined();
    expect(within(duck).queryByText(/°C$/)).toBeNull();
  });

  it("shows a fridge-start label on egg cards", async () => {
    using _guide = await renderGuide("/");
    const eggCard = cardById("egg");
    expect(within(eggCard).getByText(m.start_from_fridge())).toBeTruthy();
    expect(within(cardById("pork-fillet")).queryByText(m.start_from_fridge())).toBeNull();
  });

  it("opens the egg drawer via #info-egg without scrolling, and clears the hash on close", async () => {
    using guide = await renderGuide("/?q=egg");
    guide.scrollIntoView.mockClear();
    guide.scrollTo.mockClear();
    const eggCard = cardById("egg");
    expect(within(eggCard).getByText(m.start_from_fridge())).toBeTruthy();
    const infoLink = within(eggCard).getByRole("link", { name: m.more_info() });
    expect(infoLink.getAttribute("href")).toBe("/?q=egg#info-egg");
    fireEvent.click(infoLink);
    await vi.waitFor(() => {
      expect(guide.router.state.location.hash).toBe("info-egg");
    });
    expect(currentQuery(guide.router)).toBe("egg");
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: m.close_detail() }));
    await vi.waitFor(() => {
      expect(guide.router.state.location.hash).toBe("");
    });
    expect(currentQuery(guide.router)).toBe("egg");
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(guide.scrollIntoView).not.toHaveBeenCalled();
    expect(guide.scrollTo).not.toHaveBeenCalled();
  });

  it("opens the egg detail drawer from a #info-egg deep link, on the info button anchor", async () => {
    using _guide = await renderGuide("/#info-egg");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(m.guide_notes_heading())).toBeTruthy();
    expect(document.getElementById("info-egg")?.closest("article")?.id).toBe("egg");
  });

  it("keeps plain card permalinks closed", async () => {
    using _guide = await renderGuide("/#egg");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
