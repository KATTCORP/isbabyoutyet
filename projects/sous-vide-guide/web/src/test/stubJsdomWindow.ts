import { vi } from "vitest";
import type { Mock } from "vitest";

/** The scroll spies `stubJsdomWindow` installs; disposing restores what they replaced. */
export type JsdomWindowStub = Disposable & {
  scrollIntoView: Mock<Element["scrollIntoView"]>;
  scrollTo: Mock<typeof window.scrollTo>;
};

/**
 * jsdom leaves `window.scrollTo` (logs "Not implemented" per call) and
 * `Element.prototype.scrollIntoView` (absent) unimplemented, and TanStack
 * Router's scroll restoration and hash scrolling call both on navigation.
 * Stubs them until disposed; the returned spies let tests assert on scrolling.
 */
export function stubJsdomWindow(): JsdomWindowStub {
  const previousScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollIntoView",
  );
  const scrollIntoView = vi.fn<Element["scrollIntoView"]>();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
    writable: true,
  });
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  return {
    scrollIntoView,
    scrollTo,
    [Symbol.dispose]() {
      scrollTo.mockRestore();
      if (previousScrollIntoView) {
        Object.defineProperty(Element.prototype, "scrollIntoView", previousScrollIntoView);
      } else {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
    },
  };
}
