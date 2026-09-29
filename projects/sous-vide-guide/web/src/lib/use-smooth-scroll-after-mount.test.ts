// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useSmoothScrollAfterMount } from "@/lib/use-smooth-scroll-after-mount";

describe("useSmoothScrollAfterMount", () => {
  it("adds the smooth-scroll class on mount and removes it on unmount", () => {
    const classes = document.documentElement.classList;
    expect(classes.contains("smooth-scroll")).toBe(false);

    const hook = renderHook(() => useSmoothScrollAfterMount());
    expect(classes.contains("smooth-scroll")).toBe(true);

    hook.unmount();
    expect(classes.contains("smooth-scroll")).toBe(false);
  });
});
