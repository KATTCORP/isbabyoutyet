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

/**
 * Measures the widest string in `words` using the font of a sample element.
 * Keeps the hero name pill at a constant width so rotating names do not
 * change whether the headline wraps. Audited lib seam.
 */
export function useMaxMeasuredWidth(opts: { words: ReadonlyArray<string> }) {
  const [width, setWidth] = useState<number | null>(null);
  const words = opts.words;
  function ref(node: HTMLSpanElement | null) {
    if (!node) {
      return;
    }
    let active = true;
    const measure = () => {
      if (!active) {
        return;
      }
      const style = getComputedStyle(node);
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.whiteSpace = "nowrap";
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontSize = style.fontSize;
      probe.style.fontStyle = style.fontStyle;
      probe.style.fontWeight = style.fontWeight;
      probe.style.letterSpacing = style.letterSpacing;
      document.body.appendChild(probe);
      let max = 0;
      for (const word of words) {
        probe.textContent = word;
        max = Math.max(max, probe.offsetWidth);
      }
      probe.remove();
      setWidth(max);
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
