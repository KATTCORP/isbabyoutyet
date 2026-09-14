/**
 * Hash jumps go through TanStack Router's `scrollIntoView`, not native
 * `<a href="#…">` scrolling. CSS `html { scroll-behavior: smooth }` alone is
 * not enough: the router default is `hashScrollIntoView: true`, which calls
 * the boolean `scrollIntoView(true)` overload and jumps instantly — especially
 * noticeable on iOS Safari. Pass an options object with an explicit behavior.
 *
 * Native `behavior: "smooth"` is supported in Safari / iOS 15.4+; no polyfill
 * needed for current iPhones. Prefer this over a ponyfill.
 */
export function hashScrollIntoViewOptions(): ScrollIntoViewOptions {
  if (typeof window !== "undefined" && prefersReducedMotion()) {
    return { behavior: "instant" };
  }
  return { behavior: "smooth" };
}

/** Same preference gate for Element/window `scrollTo({ behavior })` calls. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window !== "undefined" && prefersReducedMotion()) {
    return "instant";
  }
  return "smooth";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
