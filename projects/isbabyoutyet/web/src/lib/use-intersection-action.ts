import { useEffect, useEffectEvent, useState } from "react";

/**
 * Connects an IntersectionObserver event directly to an action. Lives in lib
 * so the effect may own observer setup/cleanup; `onIntersect` is kept fresh
 * via `useEffectEvent` (same idiom as sibling timing hooks).
 *
 * The observer exists only while `enabled` and a node is attached, so callers
 * pause it (e.g. while a page is in flight) by flipping `enabled`. Re-enabling
 * creates a fresh observer, whose first callback fires again if the node is
 * still in range.
 */
export function useIntersectionAction(opts: {
  enabled: boolean;
  onIntersect: () => void;
  /** Grows the viewport for the check, e.g. `"0px 0px 400px 0px"` fires early. */
  rootMargin: string;
  threshold: number;
}) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const onIntersect = useEffectEvent(opts.onIntersect);

  useEffect(() => {
    if (!opts.enabled || node === null || globalThis.IntersectionObserver === undefined) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: opts.rootMargin, threshold: opts.threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [opts.enabled, opts.rootMargin, opts.threshold, node]);

  return setNode;
}
