// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSmoothScrollAfterMount } from "@/lib/use-smooth-scroll-after-mount";

const smoothScrollClass = "smooth-scroll";

describe("useSmoothScrollAfterMount", () => {
  it("adds the class a frame after mount, not during it, and removes it on unmount", async () => {
    const classes = document.documentElement.classList;
    const hook = renderHook(() => useSmoothScrollAfterMount());
    expect(classes.contains(smoothScrollClass)).toBe(false);

    await vi.waitFor(() => expect(classes.contains(smoothScrollClass)).toBe(true));

    hook.unmount();
    expect(classes.contains(smoothScrollClass)).toBe(false);
  });

  it("never adds the class if unmounted before the frame", async () => {
    const hook = renderHook(() => useSmoothScrollAfterMount());
    hook.unmount();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.documentElement.classList.contains(smoothScrollClass)).toBe(false);
  });
});
