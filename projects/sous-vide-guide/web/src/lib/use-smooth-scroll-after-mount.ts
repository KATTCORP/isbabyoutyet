import { useEffect } from "react";

/**
 * Turns on CSS smooth scrolling (`html.smooth-scroll` in `src/styles/app.css`)
 * one frame after the app first mounts. Lives in lib so the effect may own
 * that class on `<html>`.
 *
 * Until then scrolls snap: the browser's own jump to a `#hash` on load and the
 * router's hash / scroll-restoration pass after hydration would otherwise both
 * animate from the top of the page. The frame delay lets the router's pass,
 * which runs from its own post-render effect, finish instantly first.
 */
const smoothScrollClass = "smooth-scroll";

export function useSmoothScrollAfterMount() {
  useEffect(() => {
    const root = document.documentElement;
    const frame = requestAnimationFrame(() => {
      root.classList.add(smoothScrollClass);
    });
    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove(smoothScrollClass);
    };
  }, []);
}
