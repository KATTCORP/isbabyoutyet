import { useState } from "react";

/**
 * Measures an element's offsetWidth, updating on resize / ResizeObserver /
 * font load. Audited lib seam for the homepage hero word rotator.
 */
export function useMeasuredWidth() {
  const [width, setWidth] = useState<number | null>(null);
  function ref(node: HTMLSpanElement | null) {
    if (!node) {
      return;
    }
    let active = true;
    const measure = () => {
      if (active) {
        setWidth(node.offsetWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = globalThis.ResizeObserver === undefined ? null : new ResizeObserver(measure);
    observer?.observe(node);
    if (document.fonts) {
      void document.fonts.ready.then(measure);
    }
    return () => {
      active = false;
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }
  return [ref, width] as const;
}
