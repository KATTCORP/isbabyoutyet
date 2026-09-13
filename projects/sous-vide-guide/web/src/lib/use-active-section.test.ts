// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useActiveSection } from "@/lib/use-active-section";

const IDS = ["pork", "beef", "fish"] as const;

/** Places three sections at the given viewport tops, each snapping 100px below the top. */
function mountSections(tops: Record<(typeof IDS)[number], number>) {
  document.body.replaceChildren();
  for (const id of IDS) {
    const section = document.createElement("section");
    section.id = id;
    section.style.scrollMarginTop = "100px";
    // SAFETY: the hook only reads `top`; the remaining DOMRect fields are irrelevant here.
    section.getBoundingClientRect = () =>
      ({ bottom: tops[id] + 400, height: 400, top: tops[id] }) as DOMRect;
    document.body.append(section);
  }
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 10_000,
  });
}

function scrollTo(tops: Record<(typeof IDS)[number], number>) {
  mountSections(tops);
  window.dispatchEvent(new Event("scroll"));
}

describe("useActiveSection", () => {
  it("is null until a section has reached its scroll-margin line", async () => {
    mountSections({ beef: 900, fish: 1500, pork: 300 });
    const hook = renderHook(() => useActiveSection({ enabled: true, ids: IDS, onChange: null }));
    expect(hook.result.current).toBeNull();

    act(() => scrollTo({ beef: 700, fish: 1300, pork: 100 }));
    await vi.waitFor(() => expect(hook.result.current).toBe("pork"));
    hook.unmount();
  });

  it("highlights the last section whose top has passed the line and reports changes", async () => {
    mountSections({ beef: 900, fish: 1500, pork: 300 });
    const onChange = vi.fn<(id: string) => void>();
    const hook = renderHook(() => useActiveSection({ enabled: true, ids: IDS, onChange }));

    act(() => scrollTo({ beef: 60, fish: 660, pork: -540 }));
    await vi.waitFor(() => expect(hook.result.current).toBe("beef"));

    act(() => scrollTo({ beef: 300, fish: 900, pork: -300 }));
    await vi.waitFor(() => expect(hook.result.current).toBe("pork"));
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(["beef", "pork"]);
    hook.unmount();
  });

  it("treats the bottom of the page as the last section", async () => {
    mountSections({ beef: 400, fish: 700, pork: 100 });
    const hook = renderHook(() => useActiveSection({ enabled: true, ids: IDS, onChange: null }));
    await vi.waitFor(() => expect(hook.result.current).toBe("pork"));

    act(() => {
      Object.defineProperty(document.documentElement, "scrollHeight", {
        configurable: true,
        value: window.innerHeight,
      });
      window.dispatchEvent(new Event("scroll"));
    });
    await vi.waitFor(() => expect(hook.result.current).toBe("fish"));
    hook.unmount();
  });

  it("returns null while disabled", () => {
    mountSections({ beef: 60, fish: 660, pork: -540 });
    const hook = renderHook(() => useActiveSection({ enabled: false, ids: IDS, onChange: null }));
    expect(hook.result.current).toBeNull();
    hook.unmount();
  });
});
