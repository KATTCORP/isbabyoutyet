import { useLayoutEffect } from "react";

/**
 * Turns on CSS smooth scrolling (`html.smooth-scroll` in `src/styles/app.css`)
 * once the app has mounted. Lives in lib so the effect may own that class on
 * `<html>`.
 *
 * Until then scrolls snap, so the browser's own jump to a `#hash` while the
 * page loads (and its scroll restore on refresh) lands at once instead of
 * animating down from the top.
 */
const smoothScrollClass = "smooth-scroll";

export function useSmoothScrollAfterMount() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add(smoothScrollClass);
    return () => {
      root.classList.remove(smoothScrollClass);
    };
  }, []);
}
