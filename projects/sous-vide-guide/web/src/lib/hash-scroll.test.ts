// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { hashScrollIntoViewOptions, scrollBehavior } from "@/lib/hash-scroll";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hashScrollIntoViewOptions", () => {
  it("requests smooth scrolling by default", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false } satisfies Pick<MediaQueryList, "matches">),
    );

    expect(hashScrollIntoViewOptions()).toEqual({ behavior: "smooth" });
    expect(scrollBehavior()).toBe("smooth");
  });

  it("stays instant when the user prefers reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true } satisfies Pick<MediaQueryList, "matches">),
    );

    expect(hashScrollIntoViewOptions()).toEqual({ behavior: "instant" });
    expect(scrollBehavior()).toBe("instant");
  });
});
