import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

/**
 * Subscribes to visualViewport + window resize so mobile chrome (keyboard,
 * browser UI) can offset fixed docks. Audited lib seam for feature UI.
 */
export function useVisualViewportMetrics() {
  const snapshot = useSyncExternalStore(
    subscribeToVisualViewport,
    getVisualViewportSnapshot,
    getServerVisualViewportSnapshot,
  );
  const [bottomText, widthText, leftText] = snapshot.split("|");
  const bottom = Number(bottomText);
  const width = Number(widthText);
  const left = Number(leftText);
  const style: CSSProperties & Record<"--visual-viewport-bottom", string> = {
    "--visual-viewport-bottom": `${bottom}px`,
  };
  return { bottom, left, style, width };
}

function subscribeToVisualViewport(onStoreChange: () => void) {
  const viewport = window.visualViewport;
  window.addEventListener("resize", onStoreChange);
  viewport?.addEventListener("resize", onStoreChange);
  viewport?.addEventListener("scroll", onStoreChange);
  return () => {
    window.removeEventListener("resize", onStoreChange);
    viewport?.removeEventListener("resize", onStoreChange);
    viewport?.removeEventListener("scroll", onStoreChange);
  };
}

function getVisualViewportSnapshot() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return "0|0|0";
  }
  const bottom = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
  return `${bottom}|${viewport.width}|${viewport.offsetLeft}`;
}

function getServerVisualViewportSnapshot() {
  return "0|0|0";
}
