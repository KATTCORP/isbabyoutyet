// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { hashScrollIntoViewOptions, scrollBehavior } from "@/lib/hash-scroll";

function usingCleanup(dispose: () => void): Disposable {
  return {
    [Symbol.dispose]() {
      dispose();
    },
  };
}

function matchMediaMatches(matches: boolean) {
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
  return usingCleanup(() => {
    if (previous) {
      Object.defineProperty(window, "matchMedia", previous);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });
}

describe("hashScrollIntoViewOptions", () => {
  it("requests smooth scrolling by default", async () => {
    await using _matchMedia = matchMediaMatches(false);

    expect(hashScrollIntoViewOptions()).toEqual({ behavior: "smooth" });
    expect(scrollBehavior()).toBe("smooth");
  });

  it("stays instant when the user prefers reduced motion", async () => {
    await using _matchMedia = matchMediaMatches(true);

    expect(hashScrollIntoViewOptions()).toEqual({ behavior: "instant" });
    expect(scrollBehavior()).toBe("instant");
  });
});
