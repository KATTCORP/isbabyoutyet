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
import { isServer } from "@/paraglide/runtime";

export function hashScrollIntoViewOptions(): ScrollIntoViewOptions {
  return { behavior: scrollBehavior() };
}

/** Same preference gate for Element/window `scrollTo({ behavior })` calls. */
export function scrollBehavior(): ScrollBehavior {
  if (isServer || !prefersReducedMotion()) {
    return "smooth";
  }
  return "instant";
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}
